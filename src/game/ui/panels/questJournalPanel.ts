import { createStandardPanel } from './standardPanel';

export interface QuestJournalPanelElements {
  root: HTMLDivElement;
  activeContent: HTMLDivElement;
  completedContent: HTMLDivElement;
  detailsContent: HTMLDivElement;
}

export function createQuestJournalPanel(onClose: () => void): QuestJournalPanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const { root, body } = createStandardPanel('Quest Journal', 460, 420, 2920, onClose);

  const activeTitle = document.createElement('div');
  activeTitle.textContent = 'Active Quests';
  activeTitle.style.fontWeight = 'bold';
  activeTitle.style.marginBottom = '4px';

  const activeContent = document.createElement('div');
  activeContent.style.maxHeight = '92px';
  activeContent.style.overflowY = 'auto';
  activeContent.style.border = '1px solid rgba(150, 138, 102, 0.55)';
  activeContent.style.padding = '6px';
  activeContent.style.whiteSpace = 'pre-line';

  const completedTitle = document.createElement('div');
  completedTitle.textContent = 'Completed Quests';
  completedTitle.style.fontWeight = 'bold';
  completedTitle.style.marginTop = '8px';
  completedTitle.style.marginBottom = '4px';

  const completedContent = document.createElement('div');
  completedContent.style.maxHeight = '72px';
  completedContent.style.overflowY = 'auto';
  completedContent.style.border = '1px solid rgba(150, 138, 102, 0.55)';
  completedContent.style.padding = '6px';
  completedContent.style.whiteSpace = 'pre-line';

  const detailsTitle = document.createElement('div');
  detailsTitle.textContent = 'Quest Details';
  detailsTitle.style.fontWeight = 'bold';
  detailsTitle.style.marginTop = '8px';
  detailsTitle.style.marginBottom = '4px';

  const detailsContent = document.createElement('div');
  detailsContent.style.flex = '1';
  detailsContent.style.minHeight = '0';
  detailsContent.style.overflowY = 'auto';
  detailsContent.style.border = '1px solid rgba(150, 138, 102, 0.55)';
  detailsContent.style.padding = '6px';
  detailsContent.style.whiteSpace = 'pre-line';

  body.append(
    activeTitle,
    activeContent,
    completedTitle,
    completedContent,
    detailsTitle,
    detailsContent,
  );

  appElement.append(root);

  return {
    root,
    activeContent,
    completedContent,
    detailsContent,
  };
}
