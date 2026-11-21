import { state, t, api, esc, icon, toast, navigate, fmtNum, statusPill, refreshMe } from '../core.js';

const DURATIONS = [5, 10, 15, 20, 30];

function moduleIcon(id) {
  return (
    {
      director: 'sparkles',
      text_to_video: 'film',
      image_to_video: 'image',
      text_to_image: 'image',
      image_editor: 'wand',
      storyboard: 'layers',
      product_ad: 'megaphone',
      avatar: 'user',
      social: 'zap',
      extend: 'clock',
    }[id] || 'sparkles'
  );
}

function taskKey(task) {
  return `models.${task}`;
}

export function workspaceView(root, options = {}) {
  const meta = state.meta || { modules: [], styles: [], aspects: ['16:9'] };
  const moduleId = options.module || 'director';
  const mod = meta.modules.find((m) => m.id === moduleId) || meta.modules[0] || { id: moduleId, name: { en: 'Create', ar: 'إنشاء' } };
  const lang = state.locale;
  const ws = {
    module: moduleId,
    task: mod.task || 'text_to_video',
    brief: options.brief || '',
    style: options.style || (moduleId === 'product_ad' ? 'luxury' : moduleId === 'social' ? 'neon' : 'cinematic'),
    aspect: options.aspect || (moduleId === 'social' || moduleId === 'avatar' ? '9:16' : '16:9'),
    duration: options.duration || 10,
    plan: null,
    recommendation: null,
    selection: null,
    resolution: null,
    imageAsset: null,
    project: null,
    job: null,
    asset: null,
    busy: false,
    polling: false,
    providers: [],
    templates: [],
    error: '',
  };

  function label(obj) {
    return obj ? obj[lang] || obj.en : '';
  }

  function taskLabel(task) {
    const key = taskKey(task);
    const value = t(key);
    return value === key ? task.replaceAll('_', ' ') : value;
  }

  function modelsForTask(task) {
    const out = [];
    for (const provider of ws.providers) {
      for (const model of provider.models || []) {
        if (!model.tasks.includes(task)) continue;
        const ready =
          provider.enabled !== false &&
          (!provider.requiresKey || (provider.configured && provider.verified));
        out.push({
          providerId: provider.id,
          providerName: provider.name,
          modelId: model.id,
          modelName: model.name,
          cost: model.cost,
          ready,
          requiresKey: provider.requiresKey,
          configured: provider.configured,
          verified: provider.verified,
          resolutions: model.resolutions,
          durations: model.durations,
          aspects: model.aspects,
          tasks: model.tasks,
          negativePrompt: model.negativePrompt,
        });
      }
    }
    return out;
  }

  async function loadMeta() {
    const [models, config] = await Promise.all([
      api('/api/models').catch(() => ({ providers: [] })),
      api('/api/director/config').catch(() => ({ templates: [] })),
    ]);
    ws.providers = models.providers || [];
    ws.templates = (config.templates || []).filter((tpl) => !tpl.module || tpl.module === moduleId).slice(0, 3);
    if (!ws.templates.length) ws.templates = (config.templates || []).slice(0, 3);
  }

  function selectedModel() {
    if (!ws.selection) return null;
    return modelsForTask(ws.task).find(
      (m) => m.providerId === ws.selection.providerId && m.modelId === ws.selection.modelId,
    );
  }

  function planScenes() {
    if (!ws.plan) return [];
    return ws.task === 'text_to_image' ? ws.plan.scenes.slice(0, 1) : ws.plan.scenes;
  }

  function render() {
    const isImageTask = ws.task === 'text_to_image';
    const styleOptions = (meta.styles || [])
      .map((s) => `<option value="${s.id}" ${ws.style === s.id ? 'selected' : ''}>${esc(label(s))}</option>`)
      .join('');
    const aspectOptions = (meta.aspects || ['16:9'])
      .map((a) => `<option value="${a}" ${ws.aspect === a ? 'selected' : ''}>${a}</option>`)
      .join('');
    const durationOptions = DURATIONS.map(
      (d) => `<option value="${d}" ${ws.duration === d ? 'selected' : ''}>${d} ${t('common.seconds')}</option>`,
    ).join('');
    const moduleChips = (meta.modules || [])
      .map((m) => {
        const active = m.id === ws.module;
        return `<a class="chip ${active ? 'active' : ''}" href="#/${m.id === 'director' ? 'director' : `create/${m.id}`}">${icon(moduleIcon(m.id))}${esc(label(m.name))}</a>`;
      })
      .join('');

    const templateChips = ws.templates
      .map(
        (tpl, i) =>
          `<button class="chip" data-template="${i}">${icon('spark')}${esc(label(tpl.title))}</button>`,
      )
      .join('');

    const rightPanels = ws.plan ? planPanels() : idlePanels();

    root.innerHTML = `
      <div class="ws-grid">
        <div class="ws-col">
          <section class="card brief-card">
            <div class="spread" style="margin-bottom:14px;align-items:flex-start">
              <div class="row">
                <span class="tile" style="width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:var(--grad-soft);border:1px solid rgba(168,85,247,.28);color:var(--electric)">${icon(moduleIcon(ws.module))}</span>
                <div>
                  <h2 style="font-size:17px">${esc(label(mod.name))}</h2>
                  <p class="dim small">${esc(label(mod.tagline) || '')}</p>
                </div>
              </div>
              <span class="badge grad">${esc(taskLabel(ws.task))}</span>
            </div>
            <div class="chip-row" style="margin-bottom:14px">${moduleChips}</div>
            <div class="field">
              <label for="briefInput">${esc(t('director.brief_label'))}</label>
              <textarea id="briefInput" placeholder="${esc(t('home.placeholder'))}">${esc(ws.brief)}</textarea>
            </div>
            ${mod.needsImage || ws.module === 'image_to_video' ? imageBlock() : ''}
            <div class="composer-bar">
              <select id="styleSel" aria-label="${esc(t('common.style'))}">${styleOptions}</select>
              <select id="aspectSel" aria-label="${esc(t('common.aspect'))}">${aspectOptions}</select>
              <select id="durSel" aria-label="${esc(t('common.duration'))}">${durationOptions}</select>
              <span class="spacer"></span>
              <button class="btn primary" id="planBtn">${icon('sparkles')}${esc(ws.plan ? t('director.plan_cta') : t('director.plan_cta'))}</button>
            </div>
            <p class="composer-hint">${icon('zap')}${esc(t('home.cta_hint'))}</p>
            ${templateChips ? `<div class="chip-row" style="margin-top:12px">${templateChips}</div>` : ''}
            ${ws.error ? `<div class="form-error" style="margin-top:12px">${esc(ws.error)}</div>` : ''}
          </section>
          ${ws.plan && !isImageTask ? storyboardCard() : ''}
        </div>
        <div class="ws-col">${rightPanels}</div>
      </div>`;

    bind();
  }

  function imageBlock() {
    if (ws.imageAsset) {
      return `<div class="upload-preview" style="margin-top:12px">
        <img src="${esc(ws.imageAsset.url)}" alt="">
        <div class="grow"><b class="small">${esc(t('director.uploaded'))}</b><br><span class="tiny dim">${esc(ws.imageAsset.mime)}</span></div>
        <button class="btn sm ghost" id="replaceImg">${esc(t('director.replace_image'))}</button>
        <input type="file" id="imgInput" accept="image/jpeg,image/png,image/webp" hidden>
      </div>`;
    }
    return `<div class="upload-zone" id="uploadZone" style="margin-top:12px">
      ${icon('upload')}
      <b>${esc(t('director.upload_cta'))}</b>
      <span>${esc(t('director.image_hint'))}</span>
      <input type="file" id="imgInput" accept="image/jpeg,image/png,image/webp" hidden>
    </div>`;
  }

  function idlePanels() {
    const providers = (ws.providers.length ? ws.providers : state.providers || [])
      .map((p) => {
        const ready = !p.requiresKey || (p.configured && p.verified);
        return `<div class="provider-chip ${ready ? 'ready' : p.configured ? 'pending' : ''}">
          <span class="dot"></span><b>${esc(p.name)}</b>
          <span class="state">${esc(!p.requiresKey ? t('home.local_ready') : p.verified ? t('home.verified_ready') : p.configured ? t('home.unverified') : t('home.needs_key'))}</span>
        </div>`;
      })
      .join('');
    return `
      <section class="card panel">
        <div class="panel-head"><h2>${icon('cpu')}${esc(t('director.provider_title'))}</h2></div>
        <p class="small dim">${esc(t('director.provider_hint'))}</p>
        <div class="provider-strip" style="margin-top:14px">${providers || `<span class="dim small">${esc(t('common.loading'))}</span>`}</div>
      </section>
      <section class="card panel">
        <div class="panel-head"><h2>${icon('layers')}${esc(t('home.how'))}</h2></div>
        <div class="stack">
          <div><b class="small">1 · ${esc(t('home.how_1_t'))}</b><p class="small dim">${esc(t('home.how_1_d'))}</p></div>
          <div><b class="small">2 · ${esc(t('home.how_2_t'))}</b><p class="small dim">${esc(t('home.how_2_d'))}</p></div>
          <div><b class="small">3 · ${esc(t('home.how_3_t'))}</b><p class="small dim">${esc(t('home.how_3_d'))}</p></div>
        </div>
      </section>`;
  }

  function planPanels() {
    const analysis = ws.plan.analysis || {};
    const options = modelsForTask(ws.task);
    const chosen = ws.selection;
    const selected = selectedModel();
    const providerOptions = options.length
      ? options
          .map((o) => {
            const isSel = chosen && chosen.providerId === o.providerId && chosen.modelId === o.modelId;
            const stateText = o.ready
              ? o.requiresKey
                ? t('common.verified')
                : t('common.local')
              : o.configured
                ? t('home.unverified')
                : t('home.no_key');
            return `<label class="provider-option ${isSel ? 'selected' : ''} ${o.ready ? '' : 'disabled'}">
              <input type="radio" name="providerPick" value="${esc(o.providerId)}::${esc(o.modelId)}" ${isSel ? 'checked' : ''} ${o.ready ? '' : 'disabled'}>
              <span class="pinfo"><b>${esc(o.providerName)} · ${esc(o.modelName)}</b><span>${esc(stateText)}</span></span>
              <span class="cost">${fmtNum(o.cost)} ${esc(t('common.credits'))}</span>
            </label>`;
          })
          .join('')
      : `<p class="small dim">${esc(t('director.no_provider_ready'))}</p>`;

    const resolutionOptions = selected
      ? selected.resolutions
          .map((r) => `<option value="${esc(r)}" ${ws.resolution === r ? 'selected' : ''}>${esc(r)}</option>`)
          .join('')
      : '';

    return `
      <section class="card panel">
        <div class="panel-head">
          <h2>${icon('eye')}${esc(t('director.analysis_title'))}</h2>
          <span class="badge">${esc(ws.plan.engine === 'built-in' ? 'NOVA engine' : ws.plan.engine)}</span>
        </div>
        <div class="analysis-grid">
          <div class="analysis-item"><span>${esc(t('director.subject'))}</span><b>${esc(analysis.subject || '—')}</b></div>
          <div class="analysis-item"><span>${esc(t('common.style'))}</span><b>${esc(ws.plan.styleName || analysis.style || '—')}</b></div>
          <div class="analysis-item"><span>${esc(t('director.category'))}</span><b>${esc(analysis.category || '—')}</b></div>
          <div class="analysis-item"><span>${esc(t('common.tone'))}</span><b>${esc(analysis.tone || '—')}</b></div>
        </div>
        ${ws.plan.engineNote ? `<p class="engine-note">${esc(ws.plan.engineNote)}</p>` : ''}
        ${ws.plan.questions?.length ? `<div class="divider"></div><p class="small dim" style="margin-bottom:8px">${esc(t('director.questions_hint'))}</p><div class="chip-row">${ws.plan.questions
          .map((q) => q.options.map((o) => `<button class="chip" data-answer="${esc(o.value)}">${esc(label(o))}</button>`).join(''))
          .join('')}</div>` : ''}
        <div class="divider"></div>
        <div class="field">
          <label>${esc(t('director.prompt_title'))}</label>
          <textarea class="prompt-box" id="enhPrompt">${esc(ws.plan.enhancedPrompt || '')}</textarea>
          <p class="tiny dim">${esc(t('director.prompt_hint'))}</p>
        </div>
        <div class="field" style="margin-top:10px">
          <label>${esc(t('common.negativePrompt'))}</label>
          <input type="text" id="negPrompt" value="${esc(ws.plan.negativePrompt || '')}">
        </div>
      </section>
      <section class="card panel">
        <div class="panel-head">
          <h2>${icon('cpu')}${esc(t('director.provider_title'))}</h2>
          ${selected ? `<span class="badge grad">${fmtNum(selected.cost)} ${esc(t('common.credits'))}</span>` : ''}
        </div>
        <div class="provider-choice" id="providerChoice">${providerOptions}</div>
        ${ws.recommendation?.reason ? `<p class="small dim" style="margin-top:10px">${esc(ws.recommendation.reason)}</p>` : ''}
        ${resolutionOptions ? `<div class="field" style="margin-top:12px"><label>${esc(t('common.resolution'))}</label><select id="resSel">${resolutionOptions}</select></div>` : ''}
        <div class="divider"></div>
        <button class="btn primary block" id="generateBtn" ${selected ? '' : 'disabled'}>
          ${icon('play')}${esc(t('director.generate_cta'))}${selected ? ` · ${fmtNum(selected.cost)} ${esc(t('common.credits'))}` : ''}
        </button>
        <p class="tiny dim" style="margin-top:9px">${esc(t('director.cost_note'))}</p>
        <div class="result-actions">
          <button class="btn sm ghost" id="draftBtn">${icon('layers')}${esc(t('common.save'))}</button>
        </div>
      </section>
      <section id="jobPanel">${jobPanel()}</section>
      <section id="resultPanel">${resultPanel()}</section>`;
  }

  function jobPanel() {
    if (!ws.job) return '';
    const job = ws.job;
    const active = ['queued', 'starting', 'running'].includes(job.status);
    const label =
      job.status === 'failed'
        ? t('director.job_failed')
        : job.status === 'succeeded'
          ? t('director.job_succeeded')
          : job.status === 'queued'
            ? t('director.job_queued')
            : t('director.job_running');
    return `<div class="card panel">
      <div class="panel-head"><h2>${icon('activity')}${esc(t('director.generating_title'))}</h2>${statusPill(job.status)}</div>
      <p class="small ${job.status === 'failed' ? 'dim' : 'muted'}">${esc(label)}</p>
      <div class="progress"><div class="progress-bar" style="width:${Math.max(4, job.progress || 0)}%"></div></div>
      <div class="job-meta">
        <span>${esc(job.providerId)} · ${esc(job.modelId)}</span>
        <span>${esc(t('common.credits'))}: ${fmtNum(job.creditsCharged)}</span>
        ${job.attempts ? `<span>${esc(t('common.status'))}: ${job.attempts}/${job.maxAttempts}</span>` : ''}
        ${active ? '<span class="spinner"></span>' : ''}
      </div>
      ${job.error ? `<div class="job-error">${esc(job.error)}</div>` : ''}
      ${job.status === 'failed' ? `<div class="result-actions"><button class="btn sm" id="retryBtn">${icon('refresh')}${esc(t('director.retry_job'))}</button></div>` : ''}
    </div>`;
  }

  function resultPanel() {
    if (!ws.asset) return '';
    const asset = ws.asset;
    const isVideo = asset.kind === 'video';
    return `<div class="card panel">
      <div class="panel-head"><h2>${icon('film')}${esc(t('director.job_succeeded'))}</h2>${ws.project ? `<a class="btn sm ghost" href="#/project/${esc(ws.project.id)}">${esc(t('director.view_creation'))}${icon('arrowRight')}</a>` : ''}</div>
      <div class="video-frame">
        ${isVideo
          ? `<video controls playsinline preload="metadata" ${asset.posterUrl ? `poster="${esc(asset.posterUrl)}"` : ''} src="${esc(asset.url)}"></video>`
          : `<img src="${esc(asset.url)}" alt="">`}
      </div>
      <div class="result-actions">
        <a class="btn sm" href="${esc(asset.url)}/download">${icon('download')}${esc(t('common.download'))}</a>
        ${ws.project ? `<button class="btn sm ghost" id="shareBtn">${icon('link')}${esc(t('common.share'))}</button>` : ''}
      </div>
    </div>`;
  }

  function storyboardCard() {
    return `<section class="card panel">
      <div class="panel-head">
        <div><h2>${icon('layers')}${esc(t('director.storyboard_title'))}</h2><p class="tiny dim">${esc(t('director.storyboard_hint'))}</p></div>
        <span class="badge">${ws.plan.scenes.length} ${esc(t('common.scenes'))}</span>
      </div>
      <div class="storyboard">
        ${ws.plan.scenes.map((s, i) => sceneCard(s, i)).join('')}
      </div>
      <div class="result-actions">
        <button class="btn sm ghost" id="addSceneBtn">${icon('plus')}${esc(t('director.add_scene'))}</button>
      </div>
    </section>`;
  }

  function sceneCard(scene, i) {
    return `<div class="scene-card" data-scene="${i}">
      <div class="scene-head">
        <span class="scene-num">${i + 1}</span>
        <span class="small muted">${esc(t('common.scene'))} ${i + 1}</span>
        <div class="dur"><label>${esc(t('director.scene_duration'))}</label>
          <input type="number" min="1" max="15" step="0.5" value="${Number(scene.durationSec) || 2.5}" data-idx="${i}" data-field="durationSec">
        </div>
        <button class="btn sm ghost" data-remove="${i}" title="${esc(t('director.remove_scene'))}">${icon('x')}</button>
      </div>
      <div class="scene-grid">
        <div class="mini-field full"><label>${esc(t('director.scene_desc'))}</label>
          <textarea data-idx="${i}" data-field="description">${esc(scene.description)}</textarea>
        </div>
        <div class="mini-field"><label>${esc(t('director.camera_angle'))}</label>
          <input type="text" data-idx="${i}" data-field="cameraAngle" value="${esc(scene.cameraAngle)}">
        </div>
        <div class="mini-field"><label>${esc(t('director.camera_move'))}</label>
          <input type="text" data-idx="${i}" data-field="cameraMove" value="${esc(scene.cameraMove)}">
        </div>
        <div class="mini-field"><label>${esc(t('director.lighting'))}</label>
          <input type="text" data-idx="${i}" data-field="lighting" value="${esc(scene.lighting)}">
        </div>
        <div class="mini-field"><label>${esc(t('director.environment'))}</label>
          <input type="text" data-idx="${i}" data-field="environment" value="${esc(scene.environment)}">
        </div>
        <div class="mini-field full"><label>${esc(t('director.scene_prompt'))}</label>
          <textarea data-idx="${i}" data-field="prompt">${esc(scene.prompt)}</textarea>
        </div>
      </div>
    </div>`;
  }

  function bind() {
    const brief = root.querySelector('#briefInput');
    if (brief) brief.addEventListener('input', () => (ws.brief = brief.value));

    root.querySelector('#styleSel')?.addEventListener('change', (e) => {
      ws.style = e.target.value;
    });
    root.querySelector('#aspectSel')?.addEventListener('change', (e) => {
      ws.aspect = e.target.value;
    });
    root.querySelector('#durSel')?.addEventListener('change', (e) => {
      ws.duration = Number(e.target.value);
    });
    root.querySelector('#resSel')?.addEventListener('change', (e) => {
      ws.resolution = e.target.value;
    });

    root.querySelector('#planBtn')?.addEventListener('click', planNow);

    root.querySelectorAll('[data-template]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tpl = ws.templates[Number(btn.dataset.template)];
        if (!tpl) return;
        ws.brief = tpl.brief[lang] || tpl.brief.en;
        ws.style = tpl.style || ws.style;
        ws.aspect = tpl.aspect || ws.aspect;
        ws.duration = tpl.duration || ws.duration;
        render();
        planNow();
      });
    });

    root.querySelectorAll('[data-answer]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ws.brief = `${ws.brief} ${btn.dataset.answer}`.trim();
        planNow();
      });
    });

    root.querySelectorAll('.scene-card [data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const scene = ws.plan.scenes[Number(input.dataset.idx)];
        if (!scene) return;
        scene[input.dataset.field] = input.dataset.field === 'durationSec' ? Number(input.value) || 1 : input.value;
      });
    });

    root.querySelectorAll('[data-remove]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ws.plan.scenes.splice(Number(btn.dataset.remove), 1);
        if (!ws.plan.scenes.length) ws.plan = null;
        render();
      });
    });

    root.querySelector('#addSceneBtn')?.addEventListener('click', () => {
      ws.plan.scenes.push({
        idx: ws.plan.scenes.length + 1,
        description: lang === 'ar' ? 'لقطة إضافية تكمل الإيقاع' : 'An additional beat that completes the rhythm',
        cameraAngle: 'medium shot',
        cameraMove: 'slow dolly-in',
        lighting: 'soft key light with a violet rim',
        subjectAction: '',
        environment: '',
        style: ws.plan.styleName,
        durationSec: 2.5,
        prompt: '',
      });
      render();
    });

    const enh = root.querySelector('#enhPrompt');
    if (enh) enh.addEventListener('input', () => (ws.plan.enhancedPrompt = enh.value));
    const neg = root.querySelector('#negPrompt');
    if (neg) neg.addEventListener('input', () => (ws.plan.negativePrompt = neg.value));

    root.querySelectorAll('input[name="providerPick"]').forEach((radio) => {
      radio.addEventListener('change', () => {
        const [providerId, modelId] = radio.value.split('::');
        ws.selection = { providerId, modelId };
        const model = selectedModel();
        ws.resolution = model?.resolutions?.[0] || null;
        render();
      });
    });

    root.querySelector('#generateBtn')?.addEventListener('click', generateNow);
    root.querySelector('#draftBtn')?.addEventListener('click', saveDraft);
    root.querySelector('#retryBtn')?.addEventListener('click', retryJob);
    root.querySelector('#shareBtn')?.addEventListener('click', publishProject);

    const input = root.querySelector('#imgInput');
    const zone = root.querySelector('#uploadZone');
    const replace = root.querySelector('#replaceImg');
    const openPicker = () => input?.click();
    zone?.addEventListener('click', openPicker);
    replace?.addEventListener('click', openPicker);
    input?.addEventListener('change', () => uploadImage(input.files?.[0]));
  }

  async function planNow() {
    if (!ws.brief.trim()) {
      ws.error = t('director.brief_hint');
      render();
      return;
    }
    ws.busy = true;
    ws.error = '';
    const btn = root.querySelector('#planBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>${esc(t('director.analyzing'))}`;
    }
    try {
      const data = await api('/api/director/plan', {
        method: 'POST',
        body: {
          brief: ws.brief,
          module: ws.module,
          style: ws.style,
          aspect: ws.aspect,
          duration: ws.duration,
          language: ws.language,
          task: ws.task,
        },
      });
      ws.plan = data.plan;
      ws.recommendation = data.recommendation;
      const chosen = data.recommendation?.chosen;
      if (chosen) {
        ws.selection = { providerId: chosen.providerId, modelId: chosen.modelId };
      } else {
        ws.selection = null;
      }
      const model = selectedModel();
      ws.resolution = model?.resolutions?.[0] || null;
      ws.job = null;
      ws.asset = null;
      ws.project = null;
      render();
      if (!chosen) toast(t('director.no_provider_ready'), 'warn');
    } catch (err) {
      ws.error = err.message;
      render();
    } finally {
      ws.busy = false;
    }
  }

  async function uploadImage(file) {
    if (!file) return;
    const form = new FormData();
    form.append('file', file);
    try {
      const data = await api('/api/uploads', { method: 'POST', form });
      ws.imageAsset = data.asset;
      ws.error = '';
      render();
      toast(t('director.uploaded'), 'ok');
    } catch (err) {
      ws.error = err.message;
      render();
    }
  }

  function projectPayload() {
    const scenes = planScenes().map((s) => ({
      description: s.description,
      cameraAngle: s.cameraAngle,
      cameraMove: s.cameraMove,
      lighting: s.lighting,
      subjectAction: s.subjectAction,
      environment: s.environment,
      style: s.style,
      durationSec: s.durationSec,
      prompt: s.prompt,
    }));
    return {
      title: ws.plan.title || ws.brief.slice(0, 80) || 'Untitled',
      brief: ws.brief,
      module: ws.module,
      style: ws.style,
      aspect: ws.aspect,
      duration: ws.duration,
      language: ws.language,
      enhancedPrompt: ws.plan.enhancedPrompt,
      negativePrompt: ws.plan.negativePrompt,
      analysis: ws.plan.analysis,
      engine: ws.plan.engine,
      providerId: ws.selection?.providerId || null,
      modelId: ws.selection?.modelId || null,
      settings: {
        imageAssetId: ws.imageAsset?.id || null,
        palette: ws.plan.palette || null,
        task: ws.task,
      },
      scenes,
    };
  }

  async function ensureProject() {
    if (ws.project) return ws.project;
    const data = await api('/api/projects', { method: 'POST', body: projectPayload() });
    ws.project = data.project;
    return ws.project;
  }

  async function saveDraft() {
    try {
      await ensureProject();
      toast(t('director.draft_saved'), 'ok');
      navigate(`/project/${ws.project.id}`);
    } catch (err) {
      ws.error = err.message;
      render();
    }
  }

  async function generateNow() {
    if (!ws.plan || !ws.selection) return;
    if (ws.job && ['queued', 'starting', 'running'].includes(ws.job.status)) {
      toast(t('director.job_running'), 'warn');
      return;
    }
    const btn = root.querySelector('#generateBtn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span>${esc(t('common.loading'))}`;
    }
    try {
      const project = await ensureProject();
      const data = await api(`/api/projects/${project.id}/generate`, {
        method: 'POST',
        body: {
          providerId: ws.selection.providerId,
          modelId: ws.selection.modelId,
          task: ws.task,
          resolution: ws.resolution || undefined,
          imageAssetId: ws.imageAsset?.id || undefined,
        },
      });
      ws.job = data.job;
      ws.asset = null;
      ws.error = '';
      render();
      pollJob();
      refreshMe().then(syncCredits);
    } catch (err) {
      ws.error = err.message;
      if (err.status === 402) toast(err.message, 'bad');
      render();
    }
  }

  function syncCredits() {
    const pill = document.querySelector('.credits-pill');
    if (pill && state.user) {
      pill.innerHTML = `${icon('zap')}${fmtNum(state.user.credits)} ${esc(t('common.credits'))}`;
    }
  }

  async function pollJob() {
    if (!ws.job || ws.polling) return;
    ws.polling = true;
    const id = ws.job.id;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1800));
      if (!ws.job || ws.job.id !== id) break;
      try {
        const data = await api(`/api/jobs/${id}`);
        ws.job = data.job;
        if (data.asset) ws.asset = data.asset;
        const jobEl = root.querySelector('#jobPanel');
        const resultEl = root.querySelector('#resultPanel');
        if (jobEl) jobEl.innerHTML = jobPanel();
        if (resultEl) resultEl.innerHTML = resultPanel();
        bindDynamic();
        if (data.job.status === 'succeeded' || data.job.status === 'failed') {
          if (data.job.status === 'succeeded') {
            toast(t('director.job_succeeded'), 'ok');
            if (data.job.projectId) {
              ws.project = ws.project || { id: data.job.projectId };
            }
            refreshMe().then(syncCredits);
          } else {
            toast(data.job.error || t('director.job_failed'), 'bad');
            refreshMe().then(syncCredits);
          }
          break;
        }
      } catch (err) {
        toast(err.message, 'bad');
        break;
      }
    }
    ws.polling = false;
  }

  function bindDynamic() {
    root.querySelector('#retryBtn')?.addEventListener('click', retryJob);
    root.querySelector('#shareBtn')?.addEventListener('click', publishProject);
  }

  async function retryJob() {
    if (!ws.job) return;
    try {
      const data = await api(`/api/jobs/${ws.job.id}/retry`, { method: 'POST' });
      ws.job = data.job;
      ws.asset = null;
      render();
      pollJob();
      refreshMe().then(syncCredits);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function publishProject() {
    if (!ws.project) return;
    try {
      await api(`/api/projects/${ws.project.id}`, { method: 'PATCH', body: { isPublic: true } });
      const url = `${location.origin}/#/share/${ws.project.id}`;
      await navigator.clipboard.writeText(url).catch(() => {});
      toast(`${t('creations.share_on')} · ${url}`, 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  root.innerHTML = `<div class="skeleton" style="height:320px"></div>`;
  loadMeta()
    .catch(() => {})
    .finally(render);
}
