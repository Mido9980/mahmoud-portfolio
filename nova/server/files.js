import fs from 'node:fs';

export function streamFile(req, res, filePath, mime, { download = false, filename = 'nova-download' } = {}) {
  let stat;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return res.status(404).json({ error: { code: 'not_found', message: 'File not found.' } });
  }
  res.setHeader('Content-Type', mime || 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=300');
  if (download) {
    res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]+/g, '_')}"`);
  }
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      let start = match[1] ? parseInt(match[1], 10) : 0;
      let end = match[2] ? parseInt(match[2], 10) : stat.size - 1;
      if (Number.isNaN(start)) start = 0;
      if (start >= stat.size || Number.isNaN(end)) {
        res.status(416);
        res.setHeader('Content-Range', `bytes */${stat.size}`);
        return res.end();
      }
      end = Math.min(end, stat.size - 1);
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }
  }
  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(filePath).pipe(res);
}
