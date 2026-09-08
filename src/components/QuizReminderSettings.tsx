import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, Clock } from "lucide-react";
import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { requestNotificationPermission } from "@/lib/permissionCoordinator";

interface QuizReminderSettings {
  enabled: boolean;
  reminderTime: string; // Format: "HH:MM" (24-hour)
}

export const QuizReminderSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<QuizReminderSettings>({
    enabled: false,
    reminderTime: "20:00", // Default: 8 PM
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load settings from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("quizReminderSettings");
      if (saved) {
        setSettings(JSON.parse(saved));
      }
    } catch (error) {
      console.error("Failed to load quiz reminder settings:", error);
    }
  }, []);

  // Save settings to localStorage
  const saveSettings = (newSettings: QuizReminderSettings) => {
    try {
      localStorage.setItem("quizReminderSettings", JSON.stringify(newSettings));
      setSettings(newSettings);
    } catch (error) {
      console.error("Failed to save quiz reminder settings:", error);
    }
  };

  const handleToggle = async (enabled: boolean) => {
    setIsLoading(true);
    
    if (enabled) {
      // Request notification permission
      if ("Notification" in window) {
        const permission = await requestNotificationPermission();
        
        if (permission === "granted") {
          saveSettings({ ...settings, enabled: true });
          toast({
            title: "রিমাইন্ডার চালু হয়েছে! ✅",
            description: `আমরা প্রতিদিন ${formatTime(settings.reminderTime)} এ আপনাকে মনে করিয়ে দেব।`,
          });
        } else {
          toast({
            title: "নোটিফিকেশন অনুমতি প্রয়োজন",
            description: "আপনার ব্রাউজার সেটিংস থেকে নোটিফিকেশন অনুমতি দিন।",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "নোটিফিকেশন সমর্থিত নয়",
          description: "আপনার ব্রাউজার নোটিফিকেশন সমর্থন করে না।",
          variant: "destructive",
        });
      }
    } else {
      saveSettings({ ...settings, enabled: false });
      toast({
        title: "রিমাইন্ডার বন্ধ হয়েছে",
        description: "আর কোনো রিমাইন্ডার নোটিফিকেশন পাবেন না।",
      });
    }
    
    setIsLoading(false);
  };

  const handleTimeChange = (time: string) => {
    saveSettings({ ...settings, reminderTime: time });
    if (settings.enabled) {
      toast({
        title: "সময় আপডেট হয়েছে",
        description: `নতুন রিমাইন্ডার সময়: ${formatTime(time)}`,
      });
    }
  };

  const formatTime = (time24: string) => {
    const [hours, minutes] = time24.split(":");
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 || 12;
    return `${hour12}:${minutes} ${ampm}`;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          {settings.enabled ? (
            <Bell className="w-5 h-5 text-primary" />
          ) : (
            <BellOff className="w-5 h-5 text-muted-foreground" />
          )}
          <CardTitle>দৈনিক কুইজ রিমাইন্ডার</CardTitle>
        </div>
        <CardDescription>
          প্রতিদিন কুইজ খেলার জন্য নোটিফিকেশন পান এবং আপনার স্ট্রিক বজায় রাখুন 🔥
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="quiz-reminder">রিমাইন্ডার চালু করুন</Label>
            <p className="text-sm text-muted-foreground">
              যদি আজকের কুইজ না খেলে থাকেন
            </p>
          </div>
          <Switch
            id="quiz-reminder"
            checked={settings.enabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
          />
        </div>

        {/* Time Picker */}
        {settings.enabled && (
          <div className="space-y-2 p-4 bg-muted/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <Label htmlFor="reminder-time">রিমাইন্ডার সময়</Label>
            </div>
            <input
              id="reminder-time"
              type="time"
              value={settings.reminderTime}
              onChange={(e) => handleTimeChange(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-input bg-background text-foreground"
            />
            <p className="text-xs text-muted-foreground">
              বর্তমান সময়: {formatTime(settings.reminderTime)}
            </p>
          </div>
        )}

        {/* Info Box */}
        <div className="p-3 bg-primary/5 rounded-lg border border-primary/20">
          <p className="text-sm text-muted-foreground">
            💡 <strong>টিপ:</strong> প্রতিদিন একই সময়ে কুইজ খেলার অভ্যাস তৈরি করুন। 
            এটি আপনার স্ট্রিক বজায় রাখতে এবং নিয়মিত শিখতে সাহায্য করবে।
          </p>
        </div>
      </CardContent>
    </Card>
  );
};
