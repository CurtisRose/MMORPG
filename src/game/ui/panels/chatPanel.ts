export interface ChatPanelElements {
  root: HTMLDivElement;
  log: HTMLDivElement;
  input: HTMLInputElement;
}

export function createChatPanel(onSubmit: () => void): ChatPanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.left = '12px';
  root.style.bottom = '12px';
  root.style.width = '360px';
  root.style.height = '170px';
  root.style.background = 'rgba(0, 0, 0, 0.72)';
  root.style.border = '1px solid rgba(183, 170, 129, 0.85)';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.padding = '6px';
  root.style.gap = '6px';
  root.style.zIndex = '2500';
  root.style.pointerEvents = 'auto';
  root.style.color = '#f0e5c1';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '12px';

  const log = document.createElement('div');
  log.style.flex = '1';
  log.style.overflowY = 'auto';
  log.style.whiteSpace = 'pre-wrap';
  log.style.wordBreak = 'break-word';
  log.style.paddingRight = '4px';

  const form = document.createElement('form');
  form.style.display = 'flex';
  form.style.gap = '6px';

  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 120;
  input.placeholder = 'Type message...';
  input.style.flex = '1';
  input.style.background = 'rgba(23, 23, 23, 0.95)';
  input.style.border = '1px solid rgba(150, 138, 102, 0.9)';
  input.style.color = '#f0e5c1';
  input.style.fontFamily = 'monospace';
  input.style.fontSize = '12px';
  input.style.padding = '4px 6px';
  input.addEventListener('keydown', (event) => {
    event.stopPropagation();
  });

  const button = document.createElement('button');
  button.type = 'submit';
  button.textContent = 'Send';
  button.style.background = 'rgba(64, 58, 41, 0.95)';
  button.style.border = '1px solid rgba(150, 138, 102, 0.9)';
  button.style.color = '#f0e5c1';
  button.style.fontFamily = 'monospace';
  button.style.fontSize = '12px';
  button.style.padding = '4px 10px';
  button.style.cursor = 'pointer';

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    onSubmit();
  });

  form.append(input, button);
  root.append(log, form);
  appElement.append(root);

  return { root, log, input };
}
