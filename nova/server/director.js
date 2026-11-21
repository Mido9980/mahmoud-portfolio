// NOVA Director engine.
//
// This is a deterministic creative planner: it parses a brief, detects subject,
// category and tone, then builds a provider-ready prompt and a shot-by-shot
// storyboard from a cinematic knowledge base. It never pretends to be an LLM —
// when a Google Gemini key is configured, routes/director.js upgrades the plan
// with a real model call and labels the engine accordingly.

export const STYLES = {
  cinematic: {
    en: 'Cinematic',
    ar: 'سينمائي',
    look: 'cinematic anamorphic look, 35mm lens, shallow depth of field, subtle film grain, deep contrast',
    palette: ['#08080f', '#1a1038', '#8b5cf6'],
  },
  luxury: {
    en: 'Luxury',
    ar: 'فاخر',
    look: 'luxury commercial photography, polished surfaces, soft specular highlights, rich blacks, warm gold accents',
    palette: ['#070607', '#241a10', '#d4af6a'],
  },
  realistic: {
    en: 'Realistic',
    ar: 'واقعي',
    look: 'photorealistic, natural light, true-to-life textures, documentary realism',
    palette: ['#0a0c0e', '#16232b', '#7dd3fc'],
  },
  anime: {
    en: 'Anime',
    ar: 'أنمي',
    look: 'hand-drawn anime style, cel shading, vivid line art, dynamic composition',
    palette: ['#0a0f24', '#1e2f6b', '#67e8f9'],
  },
  commercial: {
    en: 'Commercial',
    ar: 'إعلاني',
    look: 'high-end product commercial, glossy studio lighting, crisp focus, brand-safe composition',
    palette: ['#0a0710', '#2d1b69', '#f472b6'],
  },
  documentary: {
    en: 'Documentary',
    ar: 'وثائقي',
    look: 'observational documentary, natural available light, handheld realism, muted grade',
    palette: ['#0b0d0c', '#20261f', '#d8d2c0'],
  },
  neon: {
    en: 'Neon',
    ar: 'نيون',
    look: 'cyberpunk neon atmosphere, magenta and cyan practical lights, wet reflective surfaces, volumetric haze',
    palette: ['#050510', '#2a0a3f', '#ff2d55'],
  },
  retro: {
    en: 'Retro film',
    ar: 'ريترو',
    look: '1970s film emulation, warm halation, vintage grain, analog color',
    palette: ['#120d08', '#3a2410', '#f59e0b'],
  },
  minimal: {
    en: 'Minimal',
    ar: 'بسيط',
    look: 'minimalist studio aesthetic, generous negative space, soft gradient backdrop, precise geometry',
    palette: ['#0b0b0d', '#1c1c22', '#e5e7eb'],
  },
};

export const ASPECTS = ['16:9', '9:16', '1:1'];

export const ASPECT_LABEL = {
  '16:9': { en: 'Landscape 16:9', ar: 'أفقي ١٦:٩' },
  '9:16': { en: 'Portrait 9:16', ar: 'عمودي ٩:١٦' },
  '1:1': { en: 'Square 1:1', ar: 'مربع ١:١' },
};

const CAMERA_ANGLES = [
  { en: 'wide establishing', ar: 'لقطة واسعة تأسيسية' },
  { en: 'medium shot', ar: 'لقطة متوسطة' },
  { en: 'close-up', ar: 'لقطة قريبة' },
  { en: 'extreme close-up macro', ar: 'ماكرو قريب جدًا' },
  { en: 'low angle', ar: 'زاوية منخفضة' },
  { en: 'aerial drift', ar: 'لقطة جوية منزلقة' },
  { en: 'dutch angle', ar: 'زاوية مائلة' },
];

const CAMERA_MOVES = [
  { en: 'slow dolly-in', ar: 'دفع بطيء للأمام' },
  { en: 'orbit around the subject', ar: 'دوران حول الموضوع' },
  { en: 'crane up', ar: 'رفع الكاميرا للأعلى' },
  { en: 'handheld follow', ar: 'متابعة محمولة' },
  { en: 'parallax slide', ar: 'انزلاق بارالاكس' },
  { en: 'locked-off tripod hold', ar: 'تثبيت على حامل ثلاثي' },
  { en: 'tilt reveal', ar: 'كشف بحركة ميل' },
];

const LIGHTING = [
  { en: 'soft key light with a violet rim', ar: 'ضوء رئيسي ناعم مع حافة بنفسجية' },
  { en: 'golden hour backlight', ar: 'ضوء خلفي ذهبي وقت الغروب' },
  { en: 'neon practical lights', ar: 'أضواء نيون عملية' },
  { en: 'high-key studio softbox', ar: 'إضاءة استوديو ساطعة' },
  { en: 'low-key chiaroscuro', ar: 'إضاءة درامية منخفضة المفاتيح' },
  { en: 'volumetric god rays', ar: 'أشعة ضوء حجمية' },
  { en: 'overcast natural light', ar: 'ضوء طبيعي غائم' },
];

const TEMPLATES = {
  product: [
    {
      en: 'The {subject} emerges from deep shadow as a single violet rim light traces its silhouette.',
      ar: 'يظهر {subject} من عمق الظل بينما يرسم ضوء بنفسجي حده الخارجي.',
    },
    {
      en: 'Hero shot: the {subject} rotates slowly on a polished black plinth, reflections gliding across its surface.',
      ar: 'لقطة بطولية: يدور {subject} ببطء على قاعدة سوداء مصقولة والانعكاسات تنزلق على سطحه.',
    },
    {
      en: 'Macro detail pass over the {subject} — texture, seams and finish in razor-sharp focus.',
      ar: 'لقطة ماكرو تفصيلية لـ {subject} — الملمس والخطوط والتشطيب بتركيز حاد.',
    },
    {
      en: 'Lifestyle moment: the {subject} sits in a minimal architectural interior as morning light sweeps the room.',
      ar: 'لحظة واقعية: {subject} داخل مساحة معمارية بسيطة بينما يمر ضوء الصباح في الغرفة.',
    },
    {
      en: 'Final hold on the {subject} with clean space for a logo, light fading to black.',
      ar: 'لقطة ختامية ثابتة على {subject} مع مساحة نظيفة للشعار والضوء يتلاشى إلى الأسود.',
    },
  ],
  social: [
    {
      en: 'Pattern-interrupt hook: a bold close-up of {subject} snaps into frame with a fast push-in.',
      ar: 'افتتاحية جاذبة: لقطة قريبة قوية لـ {subject} تدخل الإطار بدفع سريع.',
    },
    {
      en: 'Clear value moment: {subject} shown in use, one idea on screen, fast rhythm.',
      ar: 'لحظة قيمة واضحة: {subject} أثناء الاستخدام، فكرة واحدة على الشاشة وإيقاع سريع.',
    },
    {
      en: 'Proof beat: a crisp detail of {subject} that makes the benefit instantly believable.',
      ar: 'لقطة إثبات: تفصيل واضح لـ {subject} يجعل الفائدة مقنعة فورًا.',
    },
    {
      en: 'Call-to-action beat: {subject} centered with clean negative space and an energetic exit.',
      ar: 'لقطة دعوة لاتخاذ إجراء: {subject} في المنتصف مع مساحة نظيفة وخروج مفعم بالطاقة.',
    },
  ],
  story: [
    {
      en: 'Establishing wide: the world of {subject} revealed in one atmospheric frame.',
      ar: 'لقطة واسعة تأسيسية: عالم {subject} يُكشف في إطار واحد مفعم بالجو.',
    },
    {
      en: 'A character enters the frame and connects with {subject}, camera tracking gently.',
      ar: 'تدخل شخصية إلى الإطار وتتفاعل مع {subject} والكاميرا تتابع بهدوء.',
    },
    {
      en: 'Rising tension around {subject}: tighter framing, quicker movement, deeper shadows.',
      ar: 'تصاعد التوتر حول {subject}: إطار أقرب وحركة أسرع وظلال أعمق.',
    },
    {
      en: 'Climax: the decisive moment of {subject}, dramatic light and a held breath.',
      ar: 'الذروة: اللحظة الحاسمة لـ {subject} بضوء درامي وحبسة نفس.',
    },
    {
      en: 'Resolution: calm after the moment, {subject} at rest in soft light.',
      ar: 'الخاتمة: هدوء بعد اللحظة، {subject} في سكون وضوء ناعم.',
    },
  ],
  avatar: [
    {
      en: 'Presenter framed chest-up against a soft studio gradient, direct eye contact, {subject} as the topic.',
      ar: 'المذيع بإطار حتى الصدر أمام خلفية استوديو متدرجة، نظر مباشر، و{subject} هو الموضوع.',
    },
    {
      en: 'Medium shot as the presenter explains {subject} with natural gestures.',
      ar: 'لقطة متوسطة بينما يشرح المذيع {subject} بإيماءات طبيعية.',
    },
    {
      en: 'Closing beat: the presenter delivers the call to action about {subject} with a warm smile.',
      ar: 'لقطة ختامية: يقدم المذيع دعوة الإجراء بخصوص {subject} بابتسامة دافئة.',
    },
  ],
  music: [
    {
      en: 'Beat-driven opening on {subject}, strobe accents and fast cuts.',
      ar: 'افتتاحية على إيقاع {subject} مع ومضات ضوئية وقطع سريع.',
    },
    {
      en: 'Performance energy: {subject} in motion, camera orbiting the action.',
      ar: 'طاقة أداء: {subject} في حركة والكاميرا تدور حول الحدث.',
    },
    {
      en: 'Montage of textures and details around {subject}, rhythmic match cuts.',
      ar: 'مونتاج للملمس والتفاصيل حول {subject} بقطع إيقاعي متطابق.',
    },
    {
      en: 'Finale hold on {subject} as the light blooms and the frame settles.',
      ar: 'ختام ثابت على {subject} بينما يتوهج الضوء ويستقر الإطار.',
    },
  ],
  image: [
    {
      en: 'Animate the uploaded frame of {subject} with a slow cinematic push-in and drifting light.',
      ar: 'حرّك الصورة المرفوعة لـ {subject} بدفع سينمائي بطيء وضوء منزاح.',
    },
    {
      en: 'Continue the uploaded moment: {subject} shifts subtly as the camera glides past.',
      ar: 'أكمل اللحظة المرفوعة: {subject} يتحرك بهدوء بينما تمر الكاميرا.',
    },
  ],
};

const ENVIRONMENTS = {
  product: { en: 'deep black studio void with a mirrored floor', ar: 'استوديو أسود عميق بأرضية عاكسة' },
  social: { en: 'graphic studio backdrop with soft color spill', ar: 'خلفية استوديو جرافيكية مع انسكاب لوني ناعم' },
  story: { en: 'atmospheric real-world location with depth layers', ar: 'موقع واقعي مفعم بالجو بطبقات عمق' },
  avatar: { en: 'clean presenter studio with a soft gradient wall', ar: 'استوديو تقديم نظيف بجدار متدرج' },
  music: { en: 'dark stage with haze and moving lights', ar: 'مسرح مظلم مع دخان وأضواء متحركة' },
  image: { en: 'the environment of the uploaded frame', ar: 'بيئة الصورة المرفوعة' },
};

const TONE_KEYWORDS = {
  luxury: ['luxury', 'premium', 'elegant', 'high-end', 'فاخر', 'فخم', 'راقي'],
  playful: ['fun', 'playful', 'funny', 'energetic', 'مرح', 'ممتع', 'كوميدي'],
  minimal: ['minimal', 'clean', 'simple', 'بسيط', 'نظيف'],
  bold: ['bold', 'dramatic', 'intense', 'قوي', 'درامي'],
  warm: ['warm', 'cozy', 'nostalgic', 'دافئ', 'حنين'],
};

const CATEGORY_KEYWORDS = {
  product: [
    'refrigerator', 'fridge', 'phone', 'car', 'perfume', 'shoe', 'watch', 'coffee', 'bottle', 'laptop',
    'headphones', 'cosmetics', 'skincare', 'product', 'brand', 'ثلاجة', 'هاتف', 'سيارة', 'عطر', 'حذاء',
    'ساعة', 'قهوة', 'منتج', 'علامة',
  ],
  avatar: ['avatar', 'presenter', 'talking head', 'spokesperson', 'أفاتار', 'مذيع', 'متحدث'],
  social: ['tiktok', 'reel', 'shorts', 'instagram', 'social', 'viral', 'ريل', 'تيك توك', 'سوشيال'],
  music: ['music video', 'song', 'concert', 'clip', 'موسيقى', 'أغنية', 'حفلة'],
};

const STYLE_KEYWORDS = {
  anime: ['anime', 'manga', 'أنمي', 'مانجا'],
  neon: ['neon', 'cyberpunk', 'نيون', 'سايبر'],
  documentary: ['documentary', 'وثائقي'],
  retro: ['retro', 'vintage', 'ريترو', 'قديم'],
  minimal: ['minimal', 'minimalist', 'بسيط'],
  luxury: ['luxury', 'premium', 'فاخر', 'فخم'],
  realistic: ['realistic', 'photoreal', 'واقعي'],
};

function hasArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function pick(list, i) {
  return list[i % list.length];
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function detectStyle(brief, explicit) {
  if (explicit && STYLES[explicit]) return explicit;
  const lower = brief.toLowerCase();
  for (const [style, words] of Object.entries(STYLE_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return style;
  }
  return 'cinematic';
}

export function detectCategory(brief, module) {
  if (module === 'image_to_video') return 'image';
  if (module === 'avatar') return 'avatar';
  if (module === 'music_video') return 'music';
  if (module === 'social') return 'social';
  if (module === 'product_ad') return 'product';
  const lower = brief.toLowerCase();
  for (const [category, words] of Object.entries(CATEGORY_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return category;
  }
  if (module === 'storyboard' || module === 'director') return 'story';
  return 'story';
}

export function detectTone(brief) {
  const lower = brief.toLowerCase();
  for (const [tone, words] of Object.entries(TONE_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) return tone;
  }
  return 'confident';
}

export function extractSubject(brief, language) {
  let s = String(brief || '').trim();
  if (!s) return language === 'ar' ? 'فكرتك' : 'your idea';
  if (language === 'ar' || hasArabic(s)) {
    s = s.replace(/^(من فضلك\s+)?(اعمل|أنشئ|انشئ|اصنع|صمم|ولّد|انتج|أخرج)\s+/, '');
    s = s.replace(/^(إعلان|فيديو|مقطع|ريل)\s+(فاخر|سينمائي|إعلاني)?\s*(عن|لـ|ل)\s+/, '');
    s = s.replace(/[.!؟]+$/, '');
    return s.slice(0, 120) || 'فكرتك';
  }
  s = s.replace(/^(please\s+)?(create|make|build|generate|produce|design|shoot|film|craft)\s+/i, '');
  const m = s.match(/(?:commercial|ad|advert|advertisement|video|reel|clip|trailer|film)\s+(?:for|of|about|featuring)\s+(.+)/i);
  if (m) s = m[1];
  s = s.replace(/^(a|an|the)\s+/i, '');
  s = s.replace(/[.!?]+$/, '');
  return s.slice(0, 120) || 'your idea';
}

function sceneCountFor(duration, category) {
  const base = Math.max(3, Math.min(10, Math.round(duration / 4)));
  if (category === 'avatar') return Math.max(3, Math.min(4, base));
  if (category === 'image') return 1;
  return base;
}

function weightsFor(count) {
  // Slightly longer opening and closing beats read better than an even split.
  const weights = Array.from({ length: count }, () => 1);
  if (count >= 3) {
    weights[0] = 1.25;
    weights[count - 1] = 1.25;
  }
  return weights;
}

export function buildPlan(input = {}) {
  const brief = String(input.brief || '').trim();
  const language = input.language === 'ar' ? 'ar' : hasArabic(brief) ? 'ar' : 'en';
  const module = input.module || 'director';
  const aspect = ASPECTS.includes(input.aspect) ? input.aspect : '16:9';
  const duration = Math.max(5, Math.min(60, Number(input.duration) || 10));
  const styleId = detectStyle(brief, input.style);
  const style = STYLES[styleId];
  const category = detectCategory(brief, module);
  const tone = detectTone(brief);
  const subject = extractSubject(brief, language);
  const count = sceneCountFor(duration, category);
  const template = TEMPLATES[category] || TEMPLATES.story;
  const weights = weightsFor(count);
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  const env = ENVIRONMENTS[category] || ENVIRONMENTS.story;

  const scenes = [];
  for (let i = 0; i < count; i += 1) {
    const tpl = template[i % template.length];
    const continuation = i >= template.length ? (language === 'ar' ? ' (تكملة)' : ' (continuation)') : '';
    const description = (language === 'ar' ? tpl.ar : tpl.en).replaceAll('{subject}', subject) + continuation;
    const angle = pick(CAMERA_ANGLES, i);
    const move = pick(CAMERA_MOVES, i + (category === 'product' ? 0 : 2));
    const light = pick(LIGHTING, i + (styleId === 'neon' ? 2 : 0));
    const sceneDuration = Math.round(((duration * weights[i]) / weightTotal) * 10) / 10;
    const prompt = [
      style.look,
      description,
      `${move.en} camera move`,
      `${angle.en} framing`,
      light.en,
      env.en,
      `${aspect} framing, ${sceneDuration}s, 24fps, ultra detailed, professional color grade`,
      'no on-screen text, no watermark, no logo artifacts',
    ].join(', ');
    scenes.push({
      idx: i + 1,
      description,
      cameraAngle: angle.en,
      cameraMove: move.en,
      lighting: light.en,
      subjectAction: language === 'ar' ? `تفاعل ${subject} مع الحركة` : `${subject} reacts to the movement`,
      environment: env.en,
      style: style.en,
      durationSec: sceneDuration,
      prompt,
    });
  }

  const aspectLabel = ASPECT_LABEL[aspect][language];
  const summary =
    language === 'ar'
      ? `${style.ar} · ${subject} · ${aspectLabel} · ${duration} ثانية · ${tone}`
      : `${style.en} · ${subject} · ${aspectLabel} · ${duration}s · ${tone} tone`;

  const enhancedPrompt =
    language === 'ar'
      ? [
          `فيديو ${style.ar} عن ${subject}.`,
          `النبرة ${tone}، ${ASPECT_LABEL[aspect].ar}، مدة ${duration} ثانية.`,
          `حركة كاميرا سينمائية (${CAMERA_MOVES[0].ar})، ${LIGHTING[0].ar}، عمق ميدان ضحل، تفاصيل فائقة، تدرج لوني احترافي.`,
          `المشهد: ${scenes[0].description}`,
          style.look,
          'بدون نصوص على الشاشة، بدون علامات مائية.',
        ].join(' ')
      : [
          `${style.en} ${duration}s ${aspectLabel} video about ${subject}.`,
          `Tone: ${tone}.`,
          `Camera: ${CAMERA_MOVES[0].en}, ${CAMERA_ANGLES[0].en}, ${LIGHTING[0].en}, shallow depth of field.`,
          `Opening: ${scenes[0].description}`,
          style.look,
          'Ultra-detailed, professional color grade, consistent subject, 24fps.',
        ].join(' ');

  const negativePrompt = 'blurry, low resolution, distorted geometry, warped faces, extra limbs, watermark, text overlays, logo artifacts, flicker, oversaturated';

  const questions = [];
  if (brief.split(/\s+/).filter(Boolean).length < 3) {
    questions.push({
      id: 'subject',
      en: 'What is the video about?',
      ar: 'عن ماذا سيكون الفيديو؟',
      options: [
        { value: 'a premium product', en: 'Premium product', ar: 'منتج فاخر' },
        { value: 'a person telling a story', en: 'A person', ar: 'شخص' },
        { value: 'a brand world', en: 'Brand world', ar: 'عالم علامة تجارية' },
      ],
    });
  }
  if (!input.style && !Object.keys(STYLE_KEYWORDS).some((k) => brief.toLowerCase().includes(k))) {
    questions.push({
      id: 'style',
      en: 'Which visual direction should lead?',
      ar: 'أي اتجاه بصري تفضّل؟',
      options: [
        { value: 'cinematic', en: 'Cinematic', ar: 'سينمائي' },
        { value: 'luxury', en: 'Luxury', ar: 'فاخر' },
        { value: 'neon', en: 'Neon', ar: 'نيون' },
      ],
    });
  }
  if (category === 'product' && !['luxury', 'playful', 'minimal', 'bold'].includes(tone)) {
    questions.push({
      id: 'tone',
      en: 'What tone fits the brand?',
      ar: 'ما النبرة المناسبة للعلامة؟',
      options: [
        { value: 'luxury', en: 'Luxury', ar: 'فاخر' },
        { value: 'minimal', en: 'Minimal', ar: 'بسيط' },
        { value: 'playful', en: 'Playful', ar: 'مرح' },
      ],
    });
  }

  return {
    analysis: {
      subject,
      category,
      tone,
      style: styleId,
      aspect,
      duration,
      language,
      keywords: brief
        .toLowerCase()
        .split(/[^\p{L}\p{N}]+/u)
        .filter((w) => w.length > 2)
        .slice(0, 8),
      summary,
    },
    title: capitalize(subject).slice(0, 70),
    enhancedPrompt,
    negativePrompt,
    scenes,
    questions: questions.slice(0, 2),
    palette: style.palette,
    styleName: language === 'ar' ? style.ar : style.en,
    engine: 'built-in',
  };
}

export const PROMPT_TEMPLATES = [
  {
    id: 't-luxury-product',
    module: 'product_ad',
    style: 'luxury',
    aspect: '16:9',
    duration: 10,
    title: { en: 'Luxury product reveal', ar: 'كشف منتج فاخر' },
    brief: {
      en: 'Create a luxury commercial for a matte black refrigerator in a dark marble kitchen.',
      ar: 'أنشئ إعلانًا فاخرًا لثلاجة سوداء مطفية في مطبخ رخامي داكن.',
    },
  },
  {
    id: 't-social-hook',
    module: 'social',
    style: 'neon',
    aspect: '9:16',
    duration: 10,
    title: { en: 'Vertical social hook', ar: 'افتتاحية سوشيال عمودية' },
    brief: {
      en: 'Make a punchy vertical reel for an energy drink, neon night city, fast rhythm.',
      ar: 'اعمل ريل عمودي سريع لمشروب طاقة في مدينة نيون ليلية بإيقاع سريع.',
    },
  },
  {
    id: 't-cinematic-story',
    module: 'director',
    style: 'cinematic',
    aspect: '16:9',
    duration: 20,
    title: { en: 'Cinematic short story', ar: 'قصة سينمائية قصيرة' },
    brief: {
      en: 'A lone traveler crossing a foggy desert at dawn, searching for a distant light.',
      ar: 'مسافر وحيد يعبر صحراء ضبابية عند الفجر بحثًا عن ضوء بعيد.',
    },
  },
  {
    id: 't-anime',
    module: 'text_to_video',
    style: 'anime',
    aspect: '16:9',
    duration: 10,
    title: { en: 'Anime city flythrough', ar: 'تحليق أنمي فوق المدينة' },
    brief: {
      en: 'Anime style flythrough over a rainy futuristic city at night.',
      ar: 'تحليق بأسلوب أنمي فوق مدينة مستقبلية ممطرة ليلًا.',
    },
  },
  {
    id: 't-avatar',
    module: 'avatar',
    style: 'commercial',
    aspect: '9:16',
    duration: 10,
    title: { en: 'Presenter announcement', ar: 'إعلان من مذيع' },
    brief: {
      en: 'A friendly presenter announces a new fitness app in a bright studio.',
      ar: 'مذيع ودود يعلن عن تطبيق لياقة جديد في استوديو مضيء.',
    },
  },
  {
    id: 't-doc',
    module: 'director',
    style: 'documentary',
    aspect: '16:9',
    duration: 15,
    title: { en: 'Documentary opening', ar: 'افتتاحية وثائقية' },
    brief: {
      en: 'Documentary opening about a traditional coffee roastery before sunrise.',
      ar: 'افتتاحية وثائقية عن محمصة قهوة تقليدية قبل الشروق.',
    },
  },
];
