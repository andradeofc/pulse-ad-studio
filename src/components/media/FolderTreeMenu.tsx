import { Folder } from 'lucide-react';
import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import type { CreativeFolder } from '@/services/folderService';

interface FolderTreeMenuItemsProps {
  folders: CreativeFolder[];
  parentId?: string | null;
  /** Folder id that is currently disabled (e.g. current folder) */
  disabledFolderId?: string | null;
  onSelect: (folderId: string) => void;
}

/**
 * Renders folders as a hierarchical menu.
 * Folders without children render as a simple item.
 * Folders with children render as a submenu — clicking the trigger itself
 * still selects the parent folder (via the "Selecionar esta pasta" item inside).
 */
export function FolderTreeMenuItems({
  folders,
  parentId = null,
  disabledFolderId,
  onSelect,
}: FolderTreeMenuItemsProps) {
  const children = folders.filter((f) => (f.parent_id ?? null) === (parentId ?? null));

  if (children.length === 0) return null;

  return (
    <>
      {children.map((folder) => {
        const hasChildren = folders.some((f) => f.parent_id === folder.id);
        const disabled = disabledFolderId === folder.id;

        if (!hasChildren) {
          return (
            <DropdownMenuItem
              key={folder.id}
              onClick={() => onSelect(folder.id)}
              disabled={disabled}
            >
              <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
              {folder.name}
            </DropdownMenuItem>
          );
        }

        return (
          <DropdownMenuSub key={folder.id}>
            <DropdownMenuSubTrigger
              onClick={(e) => {
                // Allow selecting the parent folder itself by clicking the trigger label area.
                // Radix opens submenu on hover/focus; click selects.
                if (!disabled) {
                  e.preventDefault();
                  onSelect(folder.id);
                }
              }}
              disabled={disabled}
            >
              <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
              {folder.name}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => onSelect(folder.id)}
                disabled={disabled}
              >
                <Folder className="w-4 h-4 mr-2" style={{ color: folder.color }} />
                Selecionar "{folder.name}"
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <FolderTreeMenuItems
                folders={folders}
                parentId={folder.id}
                disabledFolderId={disabledFolderId}
                onSelect={onSelect}
              />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        );
      })}
    </>
  );
}
