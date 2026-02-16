import { useState, useEffect } from 'react';
import { Bell, AlertTriangle, CheckCircle, UserPlus, FileCheck, Video, Github, Clock, ChevronRight, Loader2 } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../../services/api';
import EraMatchLogo from '../../assets/image-eramatch.png';

interface AlertsNotificationsProps {
  onViewCandidate: (candidateId: number) => void;
}

interface Notification {
  id: string;
  type: 'match' | 'flag' | 'assessment' | 'interview' | 'github' | 'alert';
  title: string;
  description: string;
  candidateId: number;
  candidateName: string;
  timestamp: string;
  read: boolean;
}

export function AlertsNotifications({ onViewCandidate }: AlertsNotificationsProps) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const location = useLocation();
  const isRecruiter = location.pathname.startsWith('/recruiter');

  // Fetch alerts from API
  useEffect(() => {
    const fetchAlerts = async () => {
      try {
        setIsLoading(true);
        let data: any[] = [];

        if (isRecruiter) {
          data = await api.recruiter.getNotifications() as any[];
        } else {
          data = await api.admin.getAlerts() as any[];
        }

        // Map API data to component format
        const mappedAlerts: Notification[] = data.map((alert: any) => ({
          id: String(alert.id),
          type: (alert.type || 'match') as Notification['type'],
          title: alert.title,
          description: alert.message || '',
          candidateId: alert.data?.candidate_id || 0,
          candidateName: alert.data?.candidate_name || 'System',
          timestamp: alert.created_at ? new Date(alert.created_at).toLocaleString() : 'Just now',
          read: alert.is_read || false
        }));
        setNotifications(mappedAlerts);
      } catch (error) {
        console.error('Failed to fetch alerts:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAlerts();
  }, [isRecruiter]);

  const getIcon = (type: string) => {
    switch (type) {
      case 'match':
        return <UserPlus size={20} className="text-[#10b981]" />;
      case 'flag':
        return <AlertTriangle size={20} className="text-[#ef4444]" />;
      case 'assessment':
        return <FileCheck size={20} className="text-[#6366f1]" />;
      case 'interview':
        return <Video size={20} className="text-[#8b5cf6]" />;
      case 'github':
        return <Github size={20} className="text-[#6b7280]" />;
      default:
        return <Bell size={20} className="text-[#6b7280]" />;
    }
  };

  const getBackground = (type: string) => {
    switch (type) {
      case 'match':
        return 'bg-[#dcfce7]';
      case 'flag':
        return 'bg-[#fee2e2]';
      case 'assessment':
        return 'bg-[#ede9fe]';
      case 'interview':
        return 'bg-[#f3e8ff]';
      case 'github':
        return 'bg-[#f3f4f6]';
      default:
        return 'bg-[#f3f4f6]';
    }
  };

  const markAsRead = (id: string) => {
    setNotifications(notifications.map(n =>
      n.id === id ? { ...n, read: true } : n
    ));
  };

  const markAllAsRead = () => {
    setNotifications(notifications.map(n => ({ ...n, read: true })));
  };

  const filteredNotifications = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : notifications;

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <div className="w-full">
      <div className="w-full px-[48px] py-[24px]">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-[#111827] text-[32px] font-['Arimo',sans-serif] mb-2">Notifications</h1>
            <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
              Stay updated on candidate activities and important events
            </p>
          </div>
          <img src={EraMatchLogo} alt="Era Match" className="h-[72px] w-auto object-contain mt-1 mr-6" />
        </div>

        {/* Centered Content */}
        <div className="max-w-[1000px] mx-auto">
          {/* Filters */}
          <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setFilter('all')}
                  className={`h-[36px] px-[18px] rounded-[8px] font-['Arimo',sans-serif] text-[14px] transition-colors ${filter === 'all'
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                >
                  All ({notifications.length})
                </button>
                <button
                  onClick={() => setFilter('unread')}
                  className={`h-[36px] px-[18px] rounded-[8px] font-['Arimo',sans-serif] text-[14px] transition-colors ${filter === 'unread'
                    ? 'bg-[#6366f1] text-white'
                    : 'bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]'
                    }`}
                >
                  Unread ({unreadCount})
                </button>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="font-['Arimo',sans-serif] text-[13px] text-[#6366f1] hover:underline"
                >
                  Mark all as read
                </button>
              )}
            </div>
          </div>

          {/* Notifications List */}
          <div className="space-y-3">
            {filteredNotifications.length === 0 ? (
              <div className="bg-white rounded-[12px] border border-[#e5e7eb] p-12 text-center">
                <div className="w-[64px] h-[64px] rounded-full bg-[#f3f4f6] flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} className="text-[#6b7280]" />
                </div>
                <h3 className="text-[#111827] mb-2 font-['Arimo',sans-serif] text-[16px] font-medium">All caught up!</h3>
                <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280]">
                  You have no {filter === 'unread' ? 'unread' : ''} notifications
                </p>
              </div>
            ) : (
              filteredNotifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`bg-white rounded-[12px] border transition-all hover:shadow-md cursor-pointer ${notification.read
                    ? 'border-[#e5e7eb]'
                    : 'border-[#6366f1] shadow-sm'
                    }`}
                  onClick={() => {
                    markAsRead(notification.id);
                    onViewCandidate(notification.candidateId);
                  }}
                >
                  <div className="p-6">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className={`w-[48px] h-[48px] rounded-[10px] ${getBackground(notification.type)} flex items-center justify-center flex-shrink-0`}>
                        {getIcon(notification.type)}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 mb-2">
                          <h3 className="text-[#111827] font-['Arimo',sans-serif] font-medium text-[16px]">{notification.title}</h3>
                          {!notification.read && (
                            <div className="w-[8px] h-[8px] rounded-full bg-[#6366f1] mt-[6px] flex-shrink-0" />
                          )}
                        </div>
                        <p className="font-['Arimo',sans-serif] text-[14px] text-[#6b7280] mb-3">
                          {notification.description}
                        </p>
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-2">
                            <div className="w-[24px] h-[24px] rounded-full bg-gradient-to-br from-[#6366f1] to-[#8b5cf6] flex items-center justify-center text-white text-[10px]">
                              {notification.candidateName.split(' ').map(n => n[0]).join('')}
                            </div>
                            <span className="font-['Arimo',sans-serif] text-[13px] text-[#374151]">
                              {notification.candidateName}
                            </span>
                          </div>
                          <div className="w-[1px] h-[14px] bg-[#e5e7eb]" />
                          <div className="flex items-center gap-1 text-[#6b7280]">
                            <Clock size={14} />
                            <span className="font-['Arimo',sans-serif] text-[13px]">
                              {notification.timestamp}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Arrow */}
                      <ChevronRight size={20} className="text-[#6b7280] flex-shrink-0 mt-[2px]" />
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
