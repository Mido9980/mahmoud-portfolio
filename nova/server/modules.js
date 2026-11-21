export const MODULES = [
  {
    id: 'director',
    task: 'text_to_video',
    name: { en: 'NOVA AI Director', ar: 'مخرج NOVA' },
    tagline: { en: 'Brief in, cinematic plan out', ar: 'فكرتك تتحول إلى خطة سينمائية' },
    description: {
      en: 'Describe an idea in natural language. NOVA writes the prompt, designs the shots and runs the generation.',
      ar: 'اوصف فكرتك بلغتك. NOVA يكتب البرومبت ويصمم اللقطات ويشغّل التوليد.',
    },
  },
  {
    id: 'text_to_video',
    task: 'text_to_video',
    name: { en: 'Text to Video', ar: 'من نص إلى فيديو' },
    tagline: { en: 'Idea to motion', ar: 'من الفكرة إلى الحركة' },
    description: {
      en: 'Turn a written scene into a video clip with full cinematic controls.',
      ar: 'حوّل مشهدًا مكتوبًا إلى مقطع فيديو بتحكم سينمائي كامل.',
    },
  },
  {
    id: 'image_to_video',
    task: 'image_to_video',
    needsImage: true,
    name: { en: 'Image to Video', ar: 'من صورة إلى فيديو' },
    tagline: { en: 'Bring a still to life', ar: 'حرّك صورة ثابتة' },
    description: {
      en: 'Upload a frame and animate it. Local render adds camera motion; connected models animate the scene.',
      ar: 'ارفع صورة وحرّكها. الرندر المحلي يضيف حركة كاميرا، والموديلات الموصولة تحرّك المشهد.',
    },
  },
  {
    id: 'text_to_image',
    task: 'text_to_image',
    name: { en: 'Text to Image', ar: 'من نص إلى صورة' },
    tagline: { en: 'Keyframes and posters', ar: 'إطارات وملصقات' },
    description: {
      en: 'Generate keyframes and posters with a connected image model.',
      ar: 'ولّد إطارات وملصقات بموديل صور موصول.',
    },
  },
  {
    id: 'image_editor',
    task: null,
    local: true,
    name: { en: 'Image Editor', ar: 'محرر الصور' },
    tagline: { en: 'Crop, grade, export', ar: 'قص وتلوين وتصدير' },
    description: {
      en: 'A real in-browser editor: crop, rotate, grade and export a still. Nothing is uploaded.',
      ar: 'محرر حقيقي في المتصفح: قص وتدوير وتلوين وتصدير. لا يتم رفع أي ملف.',
    },
  },
  {
    id: 'storyboard',
    task: 'text_to_video',
    name: { en: 'Cinematic Storyboard', ar: 'القصة المصورة' },
    tagline: { en: 'Shot-by-shot planning', ar: 'تخطيط لقطة بلقطة' },
    description: {
      en: 'Design every shot — angle, movement, light — then render the board.',
      ar: 'صمّم كل لقطة — الزاوية والحركة والضوء — ثم اعرض اللوحة.',
    },
  },
  {
    id: 'product_ad',
    task: 'text_to_video',
    name: { en: 'Product Ad Studio', ar: 'استوديو إعلانات المنتجات' },
    tagline: { en: 'Commercial-grade spots', ar: 'إعلانات بمستوى تجاري' },
    description: {
      en: 'Hook, hero reveal, macro detail and call to action for a product.',
      ar: 'افتتاحية وكشف بطولي وتفصيل ماكرو ودعوة إجراء لمنتج.',
    },
  },
  {
    id: 'avatar',
    task: 'text_to_video',
    name: { en: 'AI Talking Avatars', ar: 'أفاتار متحدث' },
    tagline: { en: 'Presenter-led clips', ar: 'مقاطع بمذيع' },
    description: {
      en: 'Plan a presenter-led message. Avatar rendering requires a connected avatar provider.',
      ar: 'خطّط رسالة بمذيع. رندر الأفاتار يتطلب مزودًا موصولًا.',
    },
  },
  {
    id: 'social',
    task: 'text_to_video',
    name: { en: 'Social Video Creator', ar: 'صانع فيديو السوشيال' },
    tagline: { en: 'Hooks that hold', ar: 'افتتاحيات تمسك المشاهد' },
    description: {
      en: 'Vertical-first, fast-rhythm clips built for feeds and stories.',
      ar: 'مقاطع عمودية سريعة الإيقاع جاهزة للفيد والتايم لاين.',
    },
  },
  {
    id: 'extend',
    task: 'extend',
    name: { en: 'Extend & Edit', ar: 'تمديد ومونتاج' },
    tagline: { en: 'Continue a story', ar: 'أكمل الحكاية' },
    description: {
      en: 'Extend a storyboard with more beats. Provider-side extension requires a connected model.',
      ar: 'مدّ القصة بلقطات إضافية. التمديد عبر المزود يتطلب موديلًا موصولًا.',
    },
  },
];

export function getModule(id) {
  return MODULES.find((m) => m.id === id) || null;
}
