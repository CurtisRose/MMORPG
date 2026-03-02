import { createStandardPanel } from './standardPanel';

export interface ShopPanelElements {
  root: HTMLDivElement;
  content: HTMLDivElement;
}

export function createShopPanel(onClose: () => void): ShopPanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const { root, body } = createStandardPanel('Trade', 560, 420, 2700, onClose);

  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.overflowY = 'auto';
  content.style.whiteSpace = 'pre-line';

  body.append(content);
  appElement.append(root);

  return { root, content };
}
