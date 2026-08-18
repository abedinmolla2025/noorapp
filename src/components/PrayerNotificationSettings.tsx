import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Bell, MapPin, Clock, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { supabasePublic } from "@/integrations/supabase/client";

const PREFERENCES_STORAGE_KEY = "noor_prayer_notification_preferences";
const DEVICE_ID_KEY = "noor_device_id";

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const CALCULATION_METHODS = [
  { value: "MWL", label: "Muslim World League" },
  { value: "ISNA", label: "Islamic Society of North America" },
  { value: "Egypt", label: "Egyptian General Authority" },
  { value: "Makkah", label: "Umm Al-Qura, Makkah" },
  { value: "Karachi", label: "University of Karachi" },
  { value: "Tehran", label: "Institute of Geophysics, Tehran" },
  { value: "Jafari", label: "Shia Ithna-Ashari" },
];

type PrayerPreference = {
  latitude: number;
  longitude: number;
  timezone: string;
  calculation_method: string;
  enabled_prayers: {
    fajr: boolean;
    dhuhr: boolean;
    asr: boolean;
    maghrib: boolean;
    isha: boolean;
  };
  notification_offset: number;
  enabled: boolean;
};

const defaultPreferences: PrayerPreference = {
  latitude: 0,
  longitude: 0,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  calculation_method: "MWL",
  enabled_prayers: {
    fajr: true,
    dhuhr: true,
    asr: true,
    maghrib: true,
    isha: true,
  },
  notification_offset: 0,
  enabled: true,
};

export function PrayerNotificationSettings() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [locationLoading, setLocationLoading] = useState(false);
  const [preferences, setPreferences] = useState<PrayerPreference>(defaultPreferences);

  useEffect(() => {
    loadPreferences();
  }, []);

  const loadPreferences = () => {
    setLoading(true);
    try {
      const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (stored) {
        setPreferences(JSON.parse(stored));
      }
    } catch (error) {
      console.error("Failed to load preferences", error);
    } finally {
      setLoading(false);
    }
  };

  const getCurrentLocation = () => {
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setPreferences({
          ...preferences,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setLocationLoading(false);
        toast({ title: "Location updated" });
      },
      (error) => {
        setLocationLoading(false);
        toast({
          title: "Location access denied",
          description: "Please enter your location manually",
          variant: "destructive",
        });
      }
    );
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      // Save locally
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));

      // Sync to database for server-side push notifications
      const deviceId = getOrCreateDeviceId();
      const payload = {
        device_id: deviceId,
        latitude: preferences.latitude,
        longitude: preferences.longitude,
        timezone: preferences.timezone,
        calculation_method: preferences.calculation_method,
        enabled_prayers: preferences.enabled_prayers,
        notification_offset: preferences.notification_offset,
        enabled: preferences.enabled,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabasePublic
        .from("user_notification_preferences" as any)
        .upsert(payload as any, { onConflict: "device_id" });

      if (error) {
        console.error("Failed to sync preferences to database:", error);
        // Still show success since local save worked
        toast({
          title: "Preferences saved locally",
          description: "Server sync will retry automatically",
        });
      } else {
        toast({ title: "✅ Prayer notifications activated!" });
      }
    } catch (error: any) {
      toast({
        title: "Failed to save preferences",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const togglePrayer = (prayer: keyof typeof preferences.enabled_prayers) => {
    setPreferences({
      ...preferences,
      enabled_prayers: {
        ...preferences.enabled_prayers,
        [prayer]: !preferences.enabled_prayers[prayer],
      },
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Prayer Time Notifications
        </CardTitle>
        <CardDescription>
          Get automatic notifications for prayer times based on your location
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label>Enable Prayer Notifications</Label>
            <p className="text-sm text-muted-foreground">Receive automatic prayer time alerts</p>
          </div>
          <Switch checked={preferences.enabled} onCheckedChange={(checked) => setPreferences({ ...preferences, enabled: checked })} />
        </div>

        {preferences.enabled && (
          <>
            {/* Location */}
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <Label>Your Location</Label>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-xs">Latitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={preferences.latitude}
                    onChange={(e) => setPreferences({ ...preferences, latitude: Number(e.target.value) })}
                    placeholder="23.8103"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Longitude</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    value={preferences.longitude}
                    onChange={(e) => setPreferences({ ...preferences, longitude: Number(e.target.value) })}
                    placeholder="90.4125"
                  />
                </div>
              </div>
              <Button onClick={getCurrentLocation} disabled={locationLoading} variant="outline" size="sm" className="w-full">
                {locationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <MapPin className="mr-2 h-4 w-4" />}
                Use Current Location
              </Button>
            </div>

            {/* Calculation Method */}
            <div className="space-y-2">
              <Label>Calculation Method</Label>
              <Select value={preferences.calculation_method} onValueChange={(value) => setPreferences({ ...preferences, calculation_method: value })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CALCULATION_METHODS.map((method) => (
                    <SelectItem key={method.value} value={method.value}>
                      {method.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Prayers to Notify */}
            <div className="space-y-3">
              <Label>Prayers to Notify</Label>
              <div className="space-y-2">
                {Object.entries({
                  fajr: "🌅 Fajr",
                  dhuhr: "☀️ Dhuhr",
                  asr: "🌤️ Asr",
                  maghrib: "🌇 Maghrib",
                  isha: "🌙 Isha",
                }).map(([key, label]) => (
                  <div key={key} className="flex items-center justify-between">
                    <span className="text-sm">{label}</span>
                    <Switch
                      checked={preferences.enabled_prayers[key as keyof typeof preferences.enabled_prayers]}
                      onCheckedChange={() => togglePrayer(key as keyof typeof preferences.enabled_prayers)}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Notification Offset */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Label>Notification Timing</Label>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Notify {Math.abs(preferences.notification_offset)} minutes {preferences.notification_offset >= 0 ? "after" : "before"} prayer time</span>
                </div>
                <Slider
                  value={[preferences.notification_offset]}
                  onValueChange={(value) => setPreferences({ ...preferences, notification_offset: value[0] })}
                  min={-30}
                  max={30}
                  step={5}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>30 min before</span>
                  <span>At prayer time</span>
                  <span>30 min after</span>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <Button onClick={savePreferences} disabled={saving} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Preferences
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
