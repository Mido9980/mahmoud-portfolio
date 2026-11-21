// Provider registry: a provider-independent capability table. Limits come from
// each provider's published API docs; adapters refuse requests outside them.
// A provider is only shown as "connected" after a live credential test passes.

export const PROVIDERS = [
  {
    id: 'local',
    name: 'NOVA Local Render',
    vendor: 'NOVA (built-in)',
    requiresKey: false,
    keyFields: [],
    docs: 'Built-in storyboard renderer',
    summary: {
      en: 'Renders your storyboard into a real MP4 with cinematic gradients, camera motion and typography. It is a storyboard renderer, not an AI video model.',
      ar: 'يحوّل القصة المصورة إلى ملف MP4 حقيقي بتدرجات سينمائية وحركة كاميرا ونصوص. محرك رندر للقصة المصورة وليس موديل فيديو بالذكاء الاصطناعي.',
    },
    tasks: ['text_to_video', 'image_to_video', 'extend'],
    aspects: ['16:9', '9:16', '1:1'],
    durations: [5, 10, 15, 20, 30],
    resolutions: ['720p'],
    models: [
      {
        id: 'nova-storyboard-v1',
        name: 'NOVA Storyboard Render',
        tasks: ['text_to_video', 'image_to_video', 'extend'],
        cost: 1,
        aspects: ['16:9', '9:16', '1:1'],
        durations: [5, 10, 15, 20, 30],
        resolutions: ['720p'],
        negativePrompt: false,
        seed: true,
        maxDuration: 30,
      },
    ],
  },
  {
    id: 'google',
    name: 'Google (Veo + Imagen)',
    vendor: 'Google AI',
    requiresKey: true,
    keyFields: [{ name: 'apiKey', label: 'Gemini API key', env: 'GEMINI_API_KEY' }],
    docs: 'https://ai.google.dev/gemini-api/docs/video',
    summary: {
      en: 'Veo video generation and Imagen stills through the Gemini API. Needs your own Google AI API key.',
      ar: 'توليد فيديو Veo وصور Imagen عبر Gemini API. يتطلب مفتاح Google AI الخاص بك.',
    },
    tasks: ['text_to_video', 'image_to_video', 'text_to_image'],
    aspects: ['16:9', '9:16'],
    durations: [4, 6, 8],
    resolutions: ['720p', '1080p'],
    models: [
      {
        id: 'veo-3.0-fast-generate-preview',
        name: 'Veo 3 Fast',
        tasks: ['text_to_video', 'image_to_video'],
        cost: 20,
        aspects: ['16:9', '9:16'],
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p'],
        negativePrompt: true,
        seed: true,
        maxDuration: 8,
      },
      {
        id: 'veo-3.0-generate-preview',
        name: 'Veo 3',
        tasks: ['text_to_video', 'image_to_video'],
        cost: 40,
        aspects: ['16:9', '9:16'],
        durations: [4, 6, 8],
        resolutions: ['720p', '1080p'],
        negativePrompt: true,
        seed: true,
        maxDuration: 8,
      },
      {
        id: 'imagen-4.0-generate-001',
        name: 'Imagen 4',
        tasks: ['text_to_image'],
        cost: 8,
        aspects: ['16:9', '9:16', '1:1'],
        durations: [],
        resolutions: ['1024'],
        negativePrompt: false,
        seed: true,
        maxDuration: 0,
      },
    ],
  },
  {
    id: 'runway',
    name: 'Runway',
    vendor: 'Runway ML',
    requiresKey: true,
    keyFields: [{ name: 'apiKey', label: 'Runway API key', env: 'RUNWAY_API_KEY' }],
    docs: 'https://docs.dev.runwayml.com',
    summary: {
      en: 'Gen-4 video models with text-to-video and image-to-video. Needs a Runway API key.',
      ar: 'موديلات Gen-4 للفيديو من النص أو الصورة. يتطلب مفتاح Runway API.',
    },
    tasks: ['text_to_video', 'image_to_video'],
    aspects: ['16:9', '9:16', '1:1'],
    durations: [5, 10],
    resolutions: ['720p'],
    models: [
      {
        id: 'gen4.5',
        name: 'Runway Gen-4.5',
        tasks: ['text_to_video', 'image_to_video'],
        cost: 18,
        aspects: ['16:9', '9:16', '1:1'],
        durations: [5, 10],
        resolutions: ['720p'],
        negativePrompt: false,
        seed: true,
        maxDuration: 10,
      },
      {
        id: 'gen4_turbo',
        name: 'Runway Gen-4 Turbo',
        tasks: ['image_to_video'],
        cost: 12,
        aspects: ['16:9', '9:16', '1:1'],
        durations: [5, 10],
        resolutions: ['720p'],
        negativePrompt: false,
        seed: true,
        maxDuration: 10,
      },
    ],
  },
  {
    id: 'kling',
    name: 'Kling AI',
    vendor: 'Kuaishou',
    requiresKey: true,
    keyFields: [
      { name: 'accessKey', label: 'Access key', env: 'KLING_ACCESS_KEY' },
      { name: 'secretKey', label: 'Secret key', env: 'KLING_SECRET_KEY' },
    ],
    docs: 'https://app.klingai.com/global/dev/document-api',
    summary: {
      en: 'Kling 2.1 video models with text-to-video and image-to-video. Needs Kling access + secret keys.',
      ar: 'موديلات Kling 2.1 للفيديو من النص أو الصورة. يتطلب مفتاح Access وSecret من Kling.',
    },
    tasks: ['text_to_video', 'image_to_video'],
    aspects: ['16:9', '9:16', '1:1'],
    durations: [5, 10],
    resolutions: ['720p', '1080p'],
    models: [
      {
        id: 'kling-v2-1-master',
        name: 'Kling 2.1 Master',
        tasks: ['text_to_video', 'image_to_video'],
        cost: 16,
        aspects: ['16:9', '9:16', '1:1'],
        durations: [5, 10],
        resolutions: ['720p', '1080p'],
        negativePrompt: true,
        seed: false,
        maxDuration: 10,
      },
      {
        id: 'kling-v2-1',
        name: 'Kling 2.1',
        tasks: ['text_to_video', 'image_to_video'],
        cost: 10,
        aspects: ['16:9', '9:16', '1:1'],
        durations: [5, 10],
        resolutions: ['720p'],
        negativePrompt: true,
        seed: false,
        maxDuration: 10,
      },
    ],
  },
];

export function getProvider(id) {
  return PROVIDERS.find((p) => p.id === id) || null;
}

export function getModel(providerId, modelId) {
  const provider = getProvider(providerId);
  if (!provider) return null;
  return provider.models.find((m) => m.id === modelId) || null;
}

export function allModels() {
  return PROVIDERS.flatMap((p) =>
    p.models.map((m) => ({
      providerId: p.id,
      providerName: p.name,
      vendor: p.vendor,
      requiresKey: p.requiresKey,
      docs: p.docs,
      ...m,
    })),
  );
}

export function modelsForTask(task) {
  return allModels().filter((m) => m.tasks.includes(task));
}
