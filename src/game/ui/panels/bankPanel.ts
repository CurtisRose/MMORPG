import { createStandardPanel } from './standardPanel';

export interface BankPanelElements {
  root: HTMLDivElement;
  inventoryHeader: HTMLDivElement;
  storageHeader: HTMLDivElement;
  inventoryGrid: HTMLDivElement;
  storageGrid: HTMLDivElement;
}

export function createBankPanel(onClose: () => void): BankPanelElements | null {
  const appElement = document.querySelector<HTMLDivElement>('#app');
  if (!appElement) {
    return null;
  }

  const { root, body } = createStandardPanel('Bank', 700, 470, 2800, onClose);

  const columns = document.createElement('div');
  columns.style.display = 'grid';
  columns.style.gridTemplateColumns = '1fr 1fr';
  columns.style.gap = '10px';
  columns.style.flex = '1';
  columns.style.minHeight = '0';

  const inventoryPanel = document.createElement('div');
  inventoryPanel.style.display = 'flex';
  inventoryPanel.style.flexDirection = 'column';
  inventoryPanel.style.gap = '6px';
  inventoryPanel.style.minHeight = '0';

  const inventoryHeader = document.createElement('div');
  inventoryHeader.textContent = 'Inventory';
  inventoryHeader.style.color = '#fff4c7';

  const inventoryGrid = document.createElement('div');
  inventoryGrid.style.display = 'grid';
  inventoryGrid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
  inventoryGrid.style.gap = '4px';
  inventoryGrid.style.alignContent = 'start';
  inventoryGrid.style.overflowY = 'auto';
  inventoryGrid.style.paddingRight = '2px';

  inventoryPanel.append(inventoryHeader, inventoryGrid);

  const bankPanel = document.createElement('div');
  bankPanel.style.display = 'flex';
  bankPanel.style.flexDirection = 'column';
  bankPanel.style.gap = '6px';
  bankPanel.style.minHeight = '0';

  const storageHeader = document.createElement('div');
  storageHeader.textContent = 'Bank storage';
  storageHeader.style.color = '#fff4c7';

  const storageGrid = document.createElement('div');
  storageGrid.style.display = 'grid';
  storageGrid.style.gridTemplateColumns = 'repeat(4, minmax(0, 1fr))';
  storageGrid.style.gap = '4px';
  storageGrid.style.alignContent = 'start';
  storageGrid.style.overflowY = 'auto';
  storageGrid.style.paddingRight = '2px';

  bankPanel.append(storageHeader, storageGrid);

  columns.append(inventoryPanel, bankPanel);
  body.append(columns);
  appElement.append(root);

  return {
    root,
    inventoryHeader,
    storageHeader,
    inventoryGrid,
    storageGrid,
  };
}
