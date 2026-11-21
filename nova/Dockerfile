FROM node:22-bookworm-slim

# ffmpeg renders the storyboard engine output; Noto provides Arabic glyphs for
# bilingual scene typography. No application source is copied into the image:
# the repo is bind-mounted at /app so edits are live.
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core fonts-noto-core ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=development
EXPOSE 3000
CMD ["node", "server/index.js"]
