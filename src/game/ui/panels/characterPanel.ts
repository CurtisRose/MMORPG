export type CharacterTab = 'skills' | 'inventory' | 'gear';

export interface CharacterPanelElements {
  root: HTMLDivElement;
  tabBar: HTMLDivElement;
  skillsContent: HTMLDivElement;
  inventoryContent: HTMLDivElement;
  inventoryHeader: HTMLDivElement;
  inventoryGrid: HTMLDivElement;
  gearContent: HTMLDivElement;
  gearGrid: HTMLDivElement;
  gearSummary: HTMLDivElement;
}

export function createCharacterPanel(onTabSelected: (tab: CharacterTab) => void): CharacterPanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const root = document.createElement('div');
  root.style.position = 'fixed';
  root.style.right = '12px';
  root.style.top = '12px';
  root.style.width = '280px';
  root.style.height = '545px';
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

  const tabBar = document.createElement('div');
  tabBar.style.display = 'flex';
  tabBar.style.gap = '4px';

  const createTabButton = (
    label: string,
    tab: CharacterTab,
  ): HTMLButtonElement => {
    const button = document.createElement('button');
    button.textContent = label;
    button.style.flex = '1';
    button.style.background = 'rgba(64, 58, 41, 0.95)';
    button.style.border = '1px solid rgba(150, 138, 102, 0.9)';
    button.style.color = '#f0e5c1';
    button.style.fontFamily = 'monospace';
    button.style.fontSize = '12px';
    button.style.padding = '4px 6px';
    button.style.cursor = 'pointer';
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onTabSelected(tab);
    });
    return button;
  };

  const skillsTabButton = createTabButton('Skills', 'skills');
  const inventoryTabButton = createTabButton('Inventory', 'inventory');
  const gearTabButton = createTabButton('Gear', 'gear');
  tabBar.append(skillsTabButton, inventoryTabButton, gearTabButton);

  const skillsContent = document.createElement('div');
  skillsContent.style.whiteSpace = 'pre-line';
  skillsContent.textContent = 'Woodcutting Lv 1\nMining Lv 1\nSmithing Lv 1\nFletching Lv 1';

  const inventoryContent = document.createElement('div');
  inventoryContent.style.display = 'flex';
  inventoryContent.style.flexDirection = 'column';
  inventoryContent.style.gap = '6px';
  inventoryContent.style.height = '100%';
  inventoryContent.style.overflow = 'hidden';

  const inventoryHeader = document.createElement('div');
  inventoryHeader.textContent = 'HP: 0/0  Gold: 0  Slots: 0/0';
  inventoryHeader.style.color = '#fff4c7';

  const inventoryGrid = document.createElement('div');
  inventoryGrid.style.display = 'grid';
  inventoryGrid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
  inventoryGrid.style.gap = '4px';
  inventoryGrid.style.padding = '0';
  inventoryGrid.style.boxSizing = 'border-box';

  inventoryContent.append(inventoryHeader, inventoryGrid);

  const gearContent = document.createElement('div');
  gearContent.style.display = 'none';
  gearContent.style.flexDirection = 'column';
  gearContent.style.flex = '1';
  gearContent.style.minHeight = '0';
  gearContent.style.gap = '6px';
  gearContent.style.overflow = 'hidden';

  const gearHeader = document.createElement('div');
  gearHeader.textContent = 'Equipped gear';
  gearHeader.style.color = '#fff4c7';

  const gearGrid = document.createElement('div');
  gearGrid.style.display = 'block';
  gearGrid.style.flex = '0 0 auto';
  gearGrid.style.overflow = 'visible';
  gearGrid.style.minHeight = '0';

  const gearSummary = document.createElement('div');
  gearSummary.style.flex = '1 1 auto';
  gearSummary.style.minHeight = '0';
  gearSummary.style.borderTop = '1px solid rgba(150, 138, 102, 0.9)';
  gearSummary.style.paddingTop = '4px';
  gearSummary.style.color = '#fff4c7';
  gearSummary.style.fontSize = '11px';
  gearSummary.style.whiteSpace = 'pre-line';
  gearSummary.style.overflowY = 'auto';
  gearSummary.style.overflowX = 'hidden';
  gearSummary.textContent = [
    'Totals',
    'STR +0',
    'CON +0',
    'Armor 0',
    'Damage Reduction (DR) 0%',
    'Accuracy Melee 0',
    'Accuracy Ranged 0',
    'Accuracy Magic 0',
    'Regen +1 HP / 10s',
  ].join('\n');

  gearContent.append(gearHeader, gearGrid, gearSummary);

  root.append(tabBar, skillsContent, inventoryContent, gearContent);
  appElement.append(root);

  return {
    root,
    tabBar,
    skillsContent,
    inventoryContent,
    inventoryHeader,
    inventoryGrid,
    gearContent,
    gearGrid,
    gearSummary,
  };
}
