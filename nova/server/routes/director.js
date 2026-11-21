import { Router } from 'express';
import { buildPlan, PROMPT_TEMPLATES, STYLES, ASPECTS } from '../director.js';
import { readiness, resolveCredentials } from '../providers/keys.js';
import { modelsForTask, PROVIDERS } from '../providers/registry.js';
import { generateJson } from '../providers/google.js';
import { requireAuth } from '../auth.js';
import { HttpError, asyncHandler, oneOf } from '../http.js';

const router = Router();
router.use(requireAuth);

function recommend(task, ready) {
  const candidates = modelsForTask(task);
  const usable = candidates.filter(
    (m) => ready[m.providerId]?.enabled && (!m.requiresKey || (ready[m.providerId].configured && ready[m.providerId].verified)),
  );
  const chosen = usable.find((m) => m.providerId !== 'local') || usable.find((m) => m.providerId === 'local') || null;
  return {
    chosen: chosen
      ? { providerId: chosen.providerId, providerName: chosen.providerName, modelId: chosen.id, modelName: chosen.name, cost: chosen.cost }
      : null,
    alternatives: candidates.map((m) => ({
      providerId: m.providerId,
      providerName: m.providerName,
      modelId: m.id,
      modelName: m.name,
      cost: m.cost,
      ready: usable.includes(m),
      requiresKey: m.requiresKey,
      configured: Boolean(ready[m.providerId]?.configured),
      verified: Boolean(ready[m.providerId]?.verified),
    })),
  };
}

function reasonFor(chosen, task, language) {
  if (!chosen) {
    return language === 'ar'
      ? 'هذه المهمة تحتاج مزودًا موصولًا ومُختبرًا. أضف مفتاح API من لوحة الإدارة ← المزودون.'
      : 'This task needs a connected, verified provider. Add an API key in Admin → Providers.';
  }
  if (chosen.providerId === 'local') {
    return language === 'ar'
      ? 'لا يوجد مزود فيديو بالذكاء الاصطناعي موصول ومُختبر، لذلك سيرندر NOVA القصة محليًا (ملف MP4 حقيقي، ليس موديل ذكاء اصطناعي).'
      : 'No verified AI video provider is connected, so NOVA will render the storyboard locally (a real MP4, not an AI model).';
  }
  return language === 'ar'
    ? `${chosen.providerName} — ${chosen.modelName} موصول ومُختبر، وهو الأنسب لهذه المهمة.`
    : `${chosen.providerName} — ${chosen.modelName} is connected and verified, the best fit for this task.`;
}

function normalizeDurations(scenes, total) {
  const sum = scenes.reduce((acc, s) => acc + s.durationSec, 0) || 1;
  let acc = 0;
  return scenes.map((s, i) => {
    const d = i === scenes.length - 1 ? total - acc : Math.round((s.durationSec / sum) * total * 10) / 10;
    acc += d;
    return { ...s, durationSec: Math.max(1, Math.round(d * 10) / 10) };
  });
}

function mergeLlm(base, llm, totalDuration) {
  if (!llm || typeof llm !== 'object') return base;
  const sceneSource = Array.isArray(llm.scenes) && llm.scenes.length ? llm.scenes.slice(0, 12) : null;
  const scenes = sceneSource
    ? sceneSource.map((s, i) => ({
        idx: i + 1,
        description: String(s.description || base.scenes[i]?.description || '').slice(0, 700),
        cameraAngle: String(s.cameraAngle || base.scenes[i]?.cameraAngle || '').slice(0, 160),
        cameraMove: String(s.cameraMove || base.scenes[i]?.cameraMove || '').slice(0, 160),
        lighting: String(s.lighting || base.scenes[i]?.lighting || '').slice(0, 160),
        subjectAction: String(s.subjectAction || base.scenes[i]?.subjectAction || '').slice(0, 200),
        environment: String(s.environment || base.scenes[i]?.environment || '').slice(0, 200),
        style: base.scenes[i]?.style || base.styleName,
        durationSec: Number(s.durationSec) || base.scenes[i]?.durationSec || 2.5,
        prompt: String(s.prompt || base.scenes[i]?.prompt || '').slice(0, 2000),
      }))
    : base.scenes;
  return {
    ...base,
    title: llm.title ? String(llm.title).slice(0, 90) : base.title,
    enhancedPrompt: llm.enhancedPrompt ? String(llm.enhancedPrompt).slice(0, 2000) : base.enhancedPrompt,
    negativePrompt: llm.negativePrompt ? String(llm.negativePrompt).slice(0, 800) : base.negativePrompt,
    scenes: normalizeDurations(scenes, totalDuration),
    engine: 'gemini-2.5-flash',
  };
}

router.get(
  '/config',
  asyncHandler(async (_req, res) => {
    res.json({
      styles: Object.entries(STYLES).map(([id, s]) => ({ id, en: s.en, ar: s.ar, palette: s.palette })),
      aspects: ASPECTS,
      templates: PROMPT_TEMPLATES,
    });
  }),
);

router.post(
  '/plan',
  asyncHandler(async (req, res) => {
    const brief = String(req.body?.brief || '').trim();
    if (brief.length < 2) throw new HttpError('Write a brief first — a sentence is enough.', 400, 'brief_required');
    if (brief.length > 2000) throw new HttpError('Keep the brief under 2000 characters.', 400, 'brief_too_long');

    const language = req.body?.language === 'ar' ? 'ar' : 'en';
    const module = String(req.body?.module || 'director');
    const aspect = oneOf(req.body?.aspect, ASPECTS, '16:9');
    const duration = Math.max(5, Math.min(30, Number(req.body?.duration) || 10));

    let plan = buildPlan({
      brief,
      module,
      style: req.body?.style,
      aspect,
      duration,
      language,
    });

    const resolved = await resolveCredentials('google');
    if (resolved) {
      try {
        const prompt = [
          'You are NOVA, a world-class cinematic AI video director.',
          `Rewrite this brief into one production-ready video prompt and a ${plan.scenes.length}-scene storyboard.`,
          `Total duration ${duration} seconds. Aspect ${aspect}. Style ${plan.styleName}. Output language: ${language === 'ar' ? 'Arabic' : 'English'}.`,
          'Respond ONLY with JSON: {"title":string,"enhancedPrompt":string,"negativePrompt":string,"scenes":[{"description":string,"cameraAngle":string,"cameraMove":string,"lighting":string,"subjectAction":string,"environment":string,"durationSec":number,"prompt":string}]}.',
          'No markdown fences. Prompts must be visual, specific and free of on-screen text.',
          `Brief: ${brief}`,
        ].join('\n');
        const llm = await generateJson(resolved.creds, prompt);
        plan = mergeLlm(plan, llm, duration);
        plan.engineNote = null;
      } catch (err) {
        plan.engineNote = `Gemini enhancement unavailable: ${err.message.slice(0, 180)}`;
      }
    }

    const ready = await readiness();
    const task = req.body?.task || 'text_to_video';
    const rec = recommend(task, ready);
    res.json({
      plan,
      recommendation: {
        ...rec,
        reason: reasonFor(rec.chosen, task, language),
      },
    });
  }),
);

router.post(
  '/enhance',
  asyncHandler(async (req, res) => {
    const prompt = String(req.body?.prompt || '').trim();
    if (prompt.length < 2) throw new HttpError('Write a prompt first.', 400, 'prompt_required');
    const language = req.body?.language === 'ar' ? 'ar' : 'en';
    const plan = buildPlan({
      brief: prompt,
      module: 'text_to_video',
      style: req.body?.style,
      aspect: oneOf(req.body?.aspect, ASPECTS, '16:9'),
      duration: Math.max(5, Math.min(30, Number(req.body?.duration) || 10)),
      language,
    });
    res.json({
      enhancedPrompt: plan.enhancedPrompt,
      negativePrompt: plan.negativePrompt,
      engine: plan.engine,
      scenes: plan.scenes,
    });
  }),
);

export default router;
