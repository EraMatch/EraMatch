import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { format } from 'date-fns';
import { CalendarIcon, Clock, Link as LinkIcon, User } from 'lucide-react';
import { toast } from 'sonner';

interface ScheduleInterviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSchedule: (data: {
        application_id: string;
        scheduled_at: string;
        duration_minutes: number;
        meeting_link?: string;
    }) => Promise<void>;
    candidateName: string;
    applicationId: string;
}

export function ScheduleInterviewModal({
    isOpen,
    onClose,
    onSchedule,
    candidateName,
    applicationId,
}: ScheduleInterviewModalProps) {
    const [date, setDate] = useState<Date | undefined>(new Date());
    const [time, setTime] = useState('10:00');
    const [duration, setDuration] = useState('60');
    const [meetingLink, setMeetingLink] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSchedule = async () => {
        if (!date) {
            toast.error('Please select a date');
            return;
        }

        try {
            setIsSubmitting(true);

            // Combine date and time
            const [hours, minutes] = time.split(':').map(Number);
            const scheduledAt = new Date(date);
            scheduledAt.setHours(hours, minutes, 0, 0);

            await onSchedule({
                application_id: applicationId,
                scheduled_at: scheduledAt.toISOString(),
                duration_minutes: parseInt(duration),
                meeting_link: meetingLink || undefined,
            });

            toast.success('Interview scheduled successfully');
            onClose();
        } catch (error) {
            console.error('Failed to schedule interview:', error);
            toast.error('Failed to schedule interview');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                    <DialogTitle>Schedule Live Interview</DialogTitle>
                    <DialogDescription>
                        Schedule a face-to-face interview session with <strong>{candidateName}</strong>.
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-6 py-4">
                    <div className="flex gap-4">
                        <div className="flex-1 space-y-2">
                            <Label className="flex items-center gap-2">
                                <CalendarIcon className="w-4 h-4 text-muted-foreground" />
                                Select Date
                            </Label>
                            <div className="border rounded-md p-2 bg-card">
                                <Calendar
                                    mode="single"
                                    selected={date}
                                    onSelect={setDate}
                                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                                    initialFocus
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-4 w-[180px]">
                            <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                    <Clock className="w-4 h-4 text-muted-foreground" />
                                    Time
                                </Label>
                                <Input
                                    type="time"
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Duration</Label>
                                <Select value={duration} onValueChange={setDuration}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select duration" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="15">15 minutes</SelectItem>
                                        <SelectItem value="30">30 minutes</SelectItem>
                                        <SelectItem value="45">45 minutes</SelectItem>
                                        <SelectItem value="60">1 hour</SelectItem>
                                        <SelectItem value="90">1.5 hours</SelectItem>
                                        <SelectItem value="120">2 hours</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                            <LinkIcon className="w-4 h-4 text-muted-foreground" />
                            Meeting Link (Zoom/Meet/etc.)
                        </Label>
                        <Input
                            placeholder="https://meet.google.com/..."
                            value={meetingLink}
                            onChange={(e) => setMeetingLink(e.target.value)}
                        />
                    </div>
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                        Cancel
                    </Button>
                    <Button onClick={handleSchedule} disabled={isSubmitting}>
                        {isSubmitting ? 'Scheduling...' : 'Schedule Interview'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
