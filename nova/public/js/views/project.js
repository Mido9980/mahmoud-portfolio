import { state, t, api, esc, icon, navigate, fmtNum, fmtDate, statusPill, confirmDialog, toast } from '../core.js';

const MODULE_TASKS = {
  image_to_video: 'image_to_video',
  text_to_image: 'text_to_image',
  extend: 'extend',
};

function modelOptions(providers, task) {
  const out = [];
  for (const provider of providers || []) {
    for (const model of provider.models || []) {
      if (!model.tasks.includes(task)) continue;
      const ready = provider.enabled !== false && (!provider.requiresKey || (provider.configured && provider.verified));
      out.push({
        providerId: provider.id,
        providerName: provider.name,
        modelId: model.id,
        modelName: model.name,
        cost: model.cost,
        ready,
        resolutions: model.resolutions,
      });
    }
  }
  return out;
}

export function projectView(root, id) {
  let bundle = null;
  let scenes = [];
  let prompt = '';
  let negative = '';
  let models = [];
  let selection = null;
  let resolution = null;
  let job = null;
  let task = 'text_to_video';
  let polling = false;

  root.innerHTML = `<div class="skeleton" style="height:420px"></div>`;

  async function load() {
    try {
      bundle = await api(`/api/projects/${id}`);
      scenes = bundle.scenes.map((s) => ({ ...s }));
      prompt = bundle.project.enhancedPrompt || '';
      negative = bundle.project.negativePrompt || '';
      task = bundle.project.settings?.task || MODULE_TASKS[bundle.project.module] || 'text_to_video';
      const md = await api('/api/models').catch(() => ({ providers: [] }));
      models = modelOptions(md.providers, task);
      const ready = models.filter((m) => m.ready);
      selection =
        ready.find((m) => m.providerId === bundle.project.providerId && m.modelId === bundle.project.modelId) ||
        ready[0] ||
        null;
      resolution = selection?.resolutions?.[0] || null;
      render();
    } catch (err) {
      root.innerHTML = `<div class="empty" style="margin-top:60px">${icon('alert')}<h3>${esc(t('common.error'))}</h3><p>${esc(err.message)}</p><a class="btn" href="#/creations" style="margin-top:16px">${esc(t('common.back'))}</a></div>`;
    }
  }

  function videoAsset() {
    return (bundle.assets || []).find((a) => a.kind === 'video' && !a.sceneId) || (bundle.assets || []).find((a) => a.kind === 'video') || null;
  }

  function render() {
    const project = bundle.project;
    const video = videoAsset();
    const isPublic = project.isPublic;
    const modelChoices = models
      .map(
        (m) => `<option value="${esc(m.providerId)}::${esc(m.modelId)}" ${selection && selection.providerId === m.providerId && selection.modelId === m.modelId ? 'selected' : ''} ${m.ready ? '' : 'disabled'}>${esc(m.providerName)} · ${esc(m.modelName)} — ${fmtNum(m.cost)} ${esc(t('common.credits'))}${m.ready ? '' : ` (${esc(t('home.needs_key'))})`}</option>`,
      )
      .join('');

    root.innerHTML = `
      <div class="spread" style="margin-bottom:18px;align-items:flex-start">
        <div>
          <a class="link" href="#/creations" style="font-size:12px;color:var(--dim)">${icon('arrowLeft')}${esc(t('nav.creations'))}</a>
          <h1 style="font-size:clamp(22px,3vw,32px);margin-top:6px">${esc(project.title)}</h1>
          <div class="row wrap" style="gap:8px;margin-top:8px">
            ${statusPill(project.status)}
            <span class="badge">${esc(project.style || '')}</span>
            <span class="badge">${esc(project.aspect)}</span>
            <span class="badge">${fmtNum(project.duration)} ${esc(t('common.seconds'))}</span>
            <span class="badge">${esc(fmtDate(project.createdAt))}</span>
            ${isPublic ? `<span class="pill live"><i></i>${esc(t('creations.public'))}</span>` : ''}
          </div>
        </div>
        <div class="row wrap">
          <button class="btn sm ghost" id="favBtn" style="color:${project.favorite ? '#ff7d95' : 'var(--dim)'}">${icon('heart')}${esc(project.favorite ? t('creations.unfavorite') : t('creations.favorite'))}</button>
          <button class="btn sm ghost" id="publishBtn">${icon('link')}${esc(isPublic ? t('creations.unpublish') : t('creations.publish'))}</button>
          <button class="btn sm danger" id="deleteBtn">${icon('trash')}${esc(t('common.delete'))}</button>
        </div>
      </div>
      <div class="two-col">
        <div class="stack">
          <section class="card panel">
            <div class="panel-head"><h2>${icon('film')}${esc(t('common.video'))}</h2>${video ? `<span class="badge">${esc(video.width ? `${video.width}×${video.height}` : '')} ${video.duration ? `· ${fmtNum(video.duration)}s` : ''}</span>` : ''}</div>
            ${video
              ? `<div class="video-frame"><video controls playsinline preload="metadata" ${video.posterUrl ? `poster="${esc(video.posterUrl)}"` : ''} src="${esc(video.url)}"></video></div>
                 <div class="result-actions">
                   <a class="btn sm" href="${esc(video.url)}/download">${icon('download')}${esc(t('common.download'))}</a>
                   ${isPublic ? `<button class="btn sm ghost" id="copyShare">${icon('copy')}${esc(t('common.share'))}</button>` : ''}
                 </div>`
              : `<div class="empty">${icon('film')}<h3>${esc(t('creations.no_video'))}</h3><p>${esc(t('director.cost_note'))}</p></div>`}
          </section>

          <section class="card panel">
            <div class="panel-head"><h2>${icon('activity')}${esc(t('director.provider_title'))}</h2></div>
            ${models.length
              ? `<div class="field"><label>${esc(t('common.model'))}</label><select id="modelSel">${modelChoices}</select></div>
                 ${selection ? `<div class="field" style="margin-top:10px"><label>${esc(t('common.resolution'))}</label><select id="projRes">${selection.resolutions.map((r) => `<option value="${esc(r)}" ${resolution === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div>` : ''}
                 <div class="result-actions">
                   <button class="btn primary" id="genBtn" ${selection ? '' : 'disabled'}>${icon('play')}${esc(t('director.generate_cta'))}${selection ? ` · ${fmtNum(selection.cost)} ${esc(t('common.credits'))}` : ''}</button>
                 </div>
                 <p class="tiny dim" style="margin-top:8px">${esc(t('director.cost_note'))}</p>`
              : `<div class="empty" style="padding:26px">${icon('alert')}<h3>${esc(t('director.no_provider_ready'))}</h3><p>${esc(t('models.admin_hint'))}</p><a class="btn sm" href="#/models" style="margin-top:12px">${esc(t('home.explore'))}</a></div>`}
            <div id="genStatus" style="margin-top:14px">${job ? jobStatusHtml(job) : ''}</div>
          </section>

          <section class="card panel">
            <div class="panel-head"><h2>${icon('clock')}${esc(t('admin.jobs'))}</h2><span class="badge">${bundle.jobs.length}</span></div>
            <div class="stack">
              ${bundle.jobs.length
                ? bundle.jobs
                    .map(
                      (j) => `<div class="row" style="align-items:flex-start;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)">
                        <div class="grow">
                          <div class="row" style="gap:8px">${statusPill(j.status)}<span class="tiny dim">${esc(j.providerId)} · ${esc(j.modelId)}</span></div>
                          <div class="tiny dim" style="margin-top:3px">${esc(fmtDate(j.createdAt))} · ${fmtNum(j.creditsCharged)} ${esc(t('common.credits'))}${j.refunded ? ` · ${esc(t('job.refunded'))}` : ''}</div>
                          ${j.error ? `<div class="tiny" style="color:#ff9db0;margin-top:3px">${esc(j.error)}</div>` : ''}
                        </div>
                        ${j.status === 'failed' ? `<button class="btn sm ghost" data-retry="${esc(j.id)}">${icon('refresh')}</button>` : ''}
                      </div>`,
                    )
                    .join('')
                : `<p class="small dim">${esc(t('admin.jobs_empty'))}</p>`}
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="card panel">
            <div class="panel-head"><h2>${icon('layers')}${esc(t('director.storyboard_title'))}</h2><span class="badge">${scenes.length}</span></div>
            <div class="stack">
              ${scenes
                .map(
                  (s, i) => `<div class="scene-card" data-scene="${i}">
                    <div class="scene-head">
                      <span class="scene-num">${i + 1}</span>
                      <span class="tiny dim">${esc(s.cameraAngle || '')} · ${esc(s.cameraMove || '')}</span>
                      <div class="dur"><label>${esc(t('director.scene_duration'))}</label><input type="number" min="1" max="15" step="0.5" value="${Number(s.durationSec)}" data-idx="${i}" data-field="durationSec"></div>
                    </div>
                    <div class="mini-field full"><textarea data-idx="${i}" data-field="description">${esc(s.description)}</textarea></div>
                    <div class="scene-actions">
                      <button class="btn sm ghost" data-scene-gen="${esc(s.id)}" data-scene-idx="${i}">${icon('refresh')}${esc(t('director.regenerate_scene'))}</button>
                      ${(bundle.assets || []).find((a) => a.sceneId === s.id) ? `<span class="pill ok"><i></i>${esc(t('common.ready'))}</span>` : ''}
                    </div>
                    ${(bundle.assets || []).find((a) => a.sceneId === s.id) ? `<video controls preload="metadata" style="width:100%;border-radius:10px;margin-top:8px" src="${esc((bundle.assets || []).find((a) => a.sceneId === s.id).url)}"></video>` : ''}
                  </div>`,
                )
                .join('')}
            </div>
            <div class="result-actions">
              <button class="btn primary" id="saveScenes">${icon('check')}${esc(t('common.save'))}</button>
            </div>
          </section>

          <section class="card panel">
            <div class="panel-head"><h2>${icon('wand')}${esc(t('director.prompt_title'))}</h2></div>
            <div class="field"><textarea class="prompt-box" id="projPrompt">${esc(prompt)}</textarea></div>
            <div class="field" style="margin-top:10px"><label>${esc(t('common.negativePrompt'))}</label><input type="text" id="projNegative" value="${esc(negative)}"></div>
            <div class="result-actions"><button class="btn" id="savePrompt">${icon('check')}${esc(t('common.save'))}</button></div>
          </section>

          <section class="card panel">
            <div class="panel-head"><h2>${icon('download')}${esc(t('common.download'))}</h2></div>
            <div class="stack">
              ${(bundle.assets || []).length
                ? bundle.assets
                    .map(
                      (a) => `<div class="row" style="gap:10px;padding:6px 0">
                        <span class="badge">${esc(a.kind)}</span>
                        <div class="grow"><span class="small">${esc(a.mime)}</span><br><span class="tiny dim">${fmtNum(Math.round(a.bytes / 1024))} KB${a.sceneId ? ' · scene' : ''}</span></div>
                        <a class="btn sm ghost" href="${esc(a.url)}/download">${icon('download')}</a>
                      </div>`,
                    )
                    .join('')
                : `<p class="small dim">${esc(t('creations.no_video'))}</p>`}
            </div>
          </section>
        </div>
      </div>`;

    bind();
  }

  function jobStatusHtml(j) {
    const active = ['queued', 'starting', 'running'].includes(j.status);
    return `<div class="job-panel">
      <div class="spread"><b class="small">${esc(j.status === 'failed' ? t('director.job_failed') : j.status === 'succeeded' ? t('director.job_succeeded') : t('director.job_running'))}</b>${statusPill(j.status)}</div>
      <div class="progress"><div class="progress-bar" style="width:${Math.max(4, j.progress || 0)}%"></div></div>
      <div class="job-meta"><span>${esc(j.providerId)} · ${esc(j.modelId)}</span><span>${fmtNum(j.creditsCharged)} ${esc(t('common.credits'))}</span>${active ? '<span class="spinner"></span>' : ''}</div>
      ${j.error ? `<div class="job-error">${esc(j.error)}</div>` : ''}
    </div>`;
  }

  function bind() {
    root.querySelectorAll('.scene-card [data-field]').forEach((input) => {
      input.addEventListener('input', () => {
        const scene = scenes[Number(input.dataset.idx)];
        if (!scene) return;
        scene[input.dataset.field] = input.dataset.field === 'durationSec' ? Number(input.value) || 1 : input.value;
      });
    });

    const promptEl = root.querySelector('#projPrompt');
    if (promptEl) promptEl.addEventListener('input', () => (prompt = promptEl.value));
    const negEl = root.querySelector('#projNegative');
    if (negEl) negEl.addEventListener('input', () => (negative = negEl.value));

    root.querySelector('#modelSel')?.addEventListener('change', (event) => {
      const [providerId, modelId] = event.target.value.split('::');
      selection = models.find((m) => m.providerId === providerId && m.modelId === modelId) || null;
      resolution = selection?.resolutions?.[0] || null;
      render();
    });
    root.querySelector('#projRes')?.addEventListener('change', (event) => {
      resolution = event.target.value;
    });

    root.querySelector('#genBtn')?.addEventListener('click', generate);
    root.querySelector('#saveScenes')?.addEventListener('click', saveScenes);
    root.querySelector('#savePrompt')?.addEventListener('click', savePrompt);
    root.querySelector('#favBtn')?.addEventListener('click', toggleFavorite);
    root.querySelector('#publishBtn')?.addEventListener('click', togglePublish);
    root.querySelector('#deleteBtn')?.addEventListener('click', deleteProject);
    root.querySelector('#copyShare')?.addEventListener('click', copyShare);
    root.querySelectorAll('[data-retry]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        try {
          const data = await api(`/api/jobs/${btn.dataset.retry}/retry`, { method: 'POST' });
          job = data.job;
          updateJobStatus();
          poll(job.id);
        } catch (err) {
          toast(err.message, 'bad');
        }
      });
    });
    root.querySelectorAll('[data-scene-gen]').forEach((btn) => {
      btn.addEventListener('click', () => generateScene(btn.dataset.sceneGen));
    });
  }

  function updateJobStatus() {
    const el = root.querySelector('#genStatus');
    if (el && job) el.innerHTML = jobStatusHtml(job);
  }

  async function poll(jobId) {
    if (polling) return;
    polling = true;
    for (;;) {
      await new Promise((r) => setTimeout(r, 1800));
      try {
        const data = await api(`/api/jobs/${jobId}`);
        job = data.job;
        updateJobStatus();
        if (job.status === 'succeeded' || job.status === 'failed') {
          toast(job.status === 'succeeded' ? t('director.job_succeeded') : job.error || t('director.job_failed'), job.status === 'succeeded' ? 'ok' : 'bad');
          break;
        }
      } catch (err) {
        toast(err.message, 'bad');
        break;
      }
    }
    polling = false;
    await load();
  }

  async function generate() {
    if (!selection) return;
    try {
      const data = await api(`/api/projects/${id}/generate`, {
        method: 'POST',
        body: { providerId: selection.providerId, modelId: selection.modelId, task, resolution },
      });
      job = data.job;
      updateJobStatus();
      poll(job.id);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function generateScene(sceneId) {
    try {
      const data = await api(`/api/projects/${id}/scenes/${sceneId}/generate`, { method: 'POST' });
      job = data.job;
      updateJobStatus();
      poll(job.id);
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function saveScenes() {
    try {
      await api(`/api/projects/${id}`, { method: 'PATCH', body: { scenes } });
      toast(t('common.success'), 'ok');
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function savePrompt() {
    try {
      await api(`/api/projects/${id}`, { method: 'PATCH', body: { enhancedPrompt: prompt, negativePrompt: negative } });
      toast(t('common.success'), 'ok');
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function toggleFavorite() {
    try {
      const isFav = bundle.project.favorite;
      await api(`/api/projects/${id}/favorite`, { method: isFav ? 'DELETE' : 'POST' });
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  function shareUrl() {
    return `${location.origin}/#/share/${id}`;
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrl());
      toast(t('common.copied'), 'ok');
    } catch {
      toast(shareUrl(), 'info');
    }
  }

  async function togglePublish() {
    try {
      const next = !bundle.project.isPublic;
      await api(`/api/projects/${id}`, { method: 'PATCH', body: { isPublic: next } });
      if (next) {
        await navigator.clipboard.writeText(shareUrl()).catch(() => {});
        toast(`${t('creations.share_on')} · ${shareUrl()}`, 'ok');
      } else {
        toast(t('creations.share_off'), 'ok');
      }
      await load();
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  async function deleteProject() {
    const ok = await confirmDialog(t('creations.delete_confirm'));
    if (!ok) return;
    try {
      await api(`/api/projects/${id}`, { method: 'DELETE' });
      navigate('/creations');
    } catch (err) {
      toast(err.message, 'bad');
    }
  }

  load();
}
