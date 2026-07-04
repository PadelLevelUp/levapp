import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, Pencil, Trash2, Copy, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  isMine: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onReaction: (emoji: string) => void;
}

const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export function MessageActionMenu({ position, onClose, onReply, onEdit, onDelete, onCopy, onReaction }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  useEffect(() => {
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [onClose]);

  useEffect(() => {
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = position.x - rect.width / 2;
      let y = position.y - rect.height - 8;
      if (x < 8) x = 8;
      if (x + rect.width > vw - 8) x = vw - rect.width - 8;
      if (y < 8) y = position.y + 8;
      if (y + rect.height > vh - 8) y = vh - rect.height - 8;
      setMenuStyle({ left: x, top: y });
    });
  }, [position]);

  const actions = [
    { icon: Reply, label: 'Reply', action: onReply },
    ...(onEdit ? [{ icon: Pencil, label: 'Edit', action: onEdit }] : []),
    { icon: Copy, label: 'Copy', action: onCopy },
    ...(onDelete ? [{ icon: Trash2, label: 'Delete', action: onDelete, destructive: true }] : []),
    { icon: X, label: 'Cancel', action: onClose },
  ];

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]">
        <motion.div
          ref={ref}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={menuStyle}
          className="message-action-menu w-56 fixed"
        >
          {/* Quick reactions */}
          <div className="flex justify-around px-3 py-2.5 border-b border-border">
            {quickReactions.map(emoji => (
              <button
                key={emoji}
                onClick={() => onReaction(emoji)}
                className="text-xl hover:scale-125 active:scale-95 transition-transform p-1"
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Actions */}
          {actions.map((item, i) => (
            <button
              key={item.label}
              onClick={item.action}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-accent',
                'destructive' in item && item.destructive ? 'text-destructive' : 'text-foreground',
                i < actions.length - 1 ? 'border-b border-border/50' : '',
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          ))}
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
