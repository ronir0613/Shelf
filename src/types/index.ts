export interface ShelfItem {
  id: string;
  title: string;
  url: string;
  note?: string;
  createdAt: number;
  remindAt: number;
  delivered?: boolean;
  everyday?: boolean;
  everydayTime?: string; // HH:MM
}
