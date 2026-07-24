FROM mcr.microsoft.com/playwright:v1.61.0-noble@sha256:57b65fdc9ceabe0ef613124c7bbe2babcf9362c4d85e382fe3b03604e84b428a

WORKDIR /work
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY --chown=pwuser:pwuser . .
RUN chown pwuser:pwuser /work

USER pwuser
ENV HOME=/home/pwuser
ENV CODEX_HOME=/home/pwuser/.codex
CMD ["npm", "run", "test:e2e"]
