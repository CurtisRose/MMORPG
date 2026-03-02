import { createStandardPanel } from './standardPanel';

export interface CraftingPanelElements {
  root: HTMLDivElement;
  content: HTMLDivElement;
}

export function createCraftingPanel(onClose: () => void): CraftingPanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const { root, body } = createStandardPanel('Crafting', 560, 420, 2850, onClose);

  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.overflowY = 'auto';
  content.style.whiteSpace = 'pre-line';

  body.append(content);
  appElement.append(root);

  return { root, content };
}
