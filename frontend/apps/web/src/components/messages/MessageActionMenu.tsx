import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Reply, Pencil, Trash2, Copy, Flag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface Props {
  isMine: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onCopy: () => void;
  onReport: () => void;
  onReaction: (emoji: string) => void;
}

const quickReactions = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

export function MessageActionMenu({ position, onClose, onReply, onEdit, onDelete, onCopy, onReport, onReaction }: Props) {
  const { t } = useTranslation();
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
      // offsetWidth/Height, NOT getBoundingClientRect(): the rect reflects the
      // CURRENT transform, and framer-motion is still holding `scale: 0.9` at
      // this point. The clamp therefore measured 201.6px for a 224px menu and
      // placed the menu 14px past the right edge — the last quick-reaction was
      // off-screen and untappable. offsetWidth is the layout size and ignores
      // transforms, so the clamp is correct regardless of animation state.
      const width = el.offsetWidth;
      const height = el.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let x = position.x - width / 2;
      let y = position.y - height - 8;
      if (x < 8) x = 8;
      if (x + width > vw - 8) x = vw - width - 8;
      if (y < 8) y = position.y + 8;
      if (y + height > vh - 8) y = vh - height - 8;
      setMenuStyle({ left: x, top: y });
    });
  }, [position]);

  const actions = [
    { icon: Reply, label: t('messages.reply'), action: onReply },
    ...(onEdit ? [{ icon: Pencil, label: t('common.edit'), action: onEdit }] : []),
    { icon: Copy, label: t('messages.copy'), action: onCopy },
    ...(onDelete ? [{ icon: Trash2, label: t('common.delete'), action: onDelete, destructive: true }] : []),
    { icon: Flag, label: t('messages.report.action'), action: onReport, testId: 'message-report' },
    { icon: X, label: t('messages.cancel'), action: onClose },
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
              data-testid={'testId' in item ? item.testId : undefined}
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
