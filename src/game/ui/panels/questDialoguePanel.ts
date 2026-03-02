import { createStandardPanel } from './standardPanel';

export interface QuestDialoguePanelElements {
  root: HTMLDivElement;
  textContent: HTMLDivElement;
  optionsRow: HTMLDivElement;
}

export function createQuestDialoguePanel(onClose: () => void): QuestDialoguePanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const { root, body } = createStandardPanel('Quest Dialogue', 460, 240, 2930, onClose);

  const textContent = document.createElement('div');
  textContent.style.flex = '1';
  textContent.style.minHeight = '0';
  textContent.style.overflowY = 'auto';
  textContent.style.whiteSpace = 'pre-line';
  textContent.style.border = '1px solid rgba(150, 138, 102, 0.55)';
  textContent.style.padding = '8px';

  const optionsRow = document.createElement('div');
  optionsRow.style.display = 'flex';
  optionsRow.style.flexWrap = 'wrap';
  optionsRow.style.gap = '6px';
  optionsRow.style.marginTop = '8px';

  body.append(textContent, optionsRow);
  appElement.append(root);

  return {
    root,
    textContent,
    optionsRow,
  };
}
