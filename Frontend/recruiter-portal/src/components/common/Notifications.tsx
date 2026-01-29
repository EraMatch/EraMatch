import { useState, useRef, useEffect } from 'react';
import { Bell, X, CheckCheck, Loader2 } from 'lucide-react';
import { api } from '../../services/api';

interface Notification {
  id: number;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'success' | 'warning' | 'alert';
  read: boolean;
}

export function Notifications() {
  const [showDropdown, setShowDropdown] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Fetch notifications from API when dropdown opens
  useEffect(() => {
    if (showDropdown && notifications.length === 0) {
      const fetchNotifications = async () => {
        try {
          setIsLoading(true);
          const data = await api.admin.getNotifications() as any[];
          // Map API data to component format
          const mappedNotifications: Notification[] = data.map((n: any) => ({
            id: n.id,
            title: n.title,
            message: n.message,
            time: n.timestamp,
            type: n.type as 'info' | 'success' | 'warning' | 'alert',
            read: n.read
          }));
          setNotifications(mappedNotifications);
        } catch (error) {
          console.error('Failed to fetch notifications:', error);
        } finally {
          setIsLoading(false);
        }
      };
      fetchNotifications();
    }
  }, [showDropdown]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        buttonRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const markAsRead = (id: number) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const deleteNotification = (id: number) => {
    setNotifications(notifications.filter(n => n.id !== id));
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'success':
        return '#10B981';
      case 'warning':
        return '#F59E0B';
      case 'alert':
        return '#EF4444';
      default:
        return '#6366F1';
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        className="w-[20px] h-[20px] flex items-center justify-center text-[#18BA84] relative"
        onClick={() => setShowDropdown(!showDropdown)}
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span
            className="absolute top-[-4px] right-[-4px] w-4 h-4 rounded-full text-white text-[10px] flex items-center justify-center"
            style={{ backgroundColor: '#EF4444' }}
          >
            {unreadCount > 3 ? '3+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute right-0 top-full mt-2 w-96 bg-white border border-gray-200 rounded-2xl shadow-lg z-50 max-h-[600px] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div>
              <h3 className="text-gray-900">Notifications</h3>
              <p className="text-gray-500 text-xs mt-1">You have {unreadCount} unread messages</p>
            </div>
            {unreadCount > 0 && (
              <button
                className="text-indigo-600 text-xs hover:underline flex items-center gap-1"
                onClick={markAllAsRead}
              >
                <CheckCheck size={14} />
                Mark all read
              </button>
            )}
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {isLoading ? (
              <div className="p-8 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell size={48} className="mx-auto mb-3 text-gray-300" />
                <p className="text-gray-500 text-sm">No notifications</p>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer ${!notification.read ? 'bg-indigo-50/30' : ''
                    }`}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                      style={{ backgroundColor: getTypeColor(notification.type) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className={`text-sm ${!notification.read ? 'text-gray-900' : 'text-gray-700'}`}>
                          {notification.title}
                        </h4>
                        <button
                          className="text-gray-400 hover:text-gray-600 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="text-gray-600 text-xs mb-2 line-clamp-2">
                        {notification.message}
                      </p>
                      <p className="text-gray-400 text-xs">{notification.time}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-gray-200 text-center">
              <button className="text-indigo-600 text-sm hover:underline">
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}