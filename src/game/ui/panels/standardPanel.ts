export interface StandardPanelElements {
  root: HTMLDivElement;
  body: HTMLDivElement;
}

function createStandardPanelHeader(titleText: string, onClose: () => void): HTMLDivElement {
  const row = document.createElement('div');
  row.style.display = 'flex';
  row.style.justifyContent = 'space-between';
  row.style.alignItems = 'center';

  const title = document.createElement('div');
  title.textContent = titleText;
  title.style.color = '#fff4c7';
  title.style.fontWeight = 'bold';

  const closeButton = document.createElement('button');
  closeButton.textContent = 'Close';
  closeButton.style.background = 'rgba(64, 58, 41, 0.95)';
  closeButton.style.border = '1px solid rgba(150, 138, 102, 0.9)';
  closeButton.style.color = '#f0e5c1';
  closeButton.style.fontFamily = 'monospace';
  closeButton.style.fontSize = '12px';
  closeButton.style.padding = '4px 8px';
  closeButton.style.cursor = 'pointer';
  closeButton.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    event.stopPropagation();
    onClose();
  });

  row.append(title, closeButton);
  return row;
}

function applyStandardPanelShell(
  root: HTMLDivElement,
  widthPx: number,
  heightPx: number,
  zIndex: number,
): void {
  root.style.position = 'fixed';
  root.style.left = '50%';
  root.style.top = '50%';
  root.style.transform = 'translate(-50%, -50%)';
  root.style.width = `${widthPx}px`;
  root.style.height = `${heightPx}px`;
  root.style.background = 'rgba(0, 0, 0, 0.86)';
  root.style.border = '1px solid rgba(183, 170, 129, 0.92)';
  root.style.display = 'none';
  root.style.flexDirection = 'column';
  root.style.padding = '8px';
  root.style.gap = '8px';
  root.style.zIndex = String(zIndex);
  root.style.pointerEvents = 'auto';
  root.style.color = '#f0e5c1';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '12px';
}

export function createStandardPanel(
  titleText: string,
  widthPx: number,
  heightPx: number,
  zIndex: number,
  onClose: () => void,
): StandardPanelElements {
  const root = document.createElement('div');
  applyStandardPanelShell(root, widthPx, heightPx, zIndex);

  const header = createStandardPanelHeader(titleText, onClose);

  const body = document.createElement('div');
  body.style.display = 'flex';
  body.style.flexDirection = 'column';
  body.style.flex = '1';
  body.style.minHeight = '0';

  root.append(header, body);
  return { root, body };
}
