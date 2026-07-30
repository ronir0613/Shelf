export interface ShelfItem {
  id: string;
  title: string;
  url: string;
  note?: string;
  createdAt: number;
  remindAt: number;
  delivered?: boolean;
}
