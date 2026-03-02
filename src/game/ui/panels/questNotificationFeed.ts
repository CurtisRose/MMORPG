export interface QuestNotificationFeedElements {
  root: HTMLDivElement;
  content: HTMLDivElement;
}

export function createQuestNotificationFeed(): QuestNotificationFeedElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.right = '12px';
  root.style.bottom = '192px';
  root.style.width = '360px';
  root.style.maxHeight = '190px';
  root.style.background = 'rgba(0, 0, 0, 0.72)';
  root.style.border = '1px solid rgba(183, 170, 129, 0.85)';
  root.style.display = 'flex';
  root.style.flexDirection = 'column';
  root.style.padding = '6px';
  root.style.gap = '6px';
  root.style.zIndex = '2910';
  root.style.pointerEvents = 'auto';
  root.style.color = '#f0e5c1';
  root.style.fontFamily = 'monospace';
  root.style.fontSize = '12px';

  const title = document.createElement('div');
  title.textContent = 'Active Quests';
  title.style.fontWeight = 'bold';
  title.style.color = '#fff4c7';

  const content = document.createElement('div');
  content.style.flex = '1';
  content.style.minHeight = '0';
  content.style.overflowY = 'auto';
  content.style.whiteSpace = 'normal';
  content.style.wordBreak = 'break-word';
  content.style.paddingRight = '4px';

  root.append(title, content);
  appElement.append(root);

  return {
    root,
    content,
  };
}
