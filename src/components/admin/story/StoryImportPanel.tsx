import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { BookOpen, Loader2, RefreshCw, Upload, Download } from 'lucide-react';
import { estimateReadingMinutes, type Story } from '@/lib/stories';

export type StoryImportResult = { insertedIds: string[]; updatedIds: string[] };

export function storyRowFromJson(story: Story, publish: boolean) {
  const bn = story.content_bn ?? story.content ?? '';
  const en = story.content_en ?? '';
  
  // Extract OG Image info from various possible fields
  const ogImageUrl = story.og_image_url || story.og_image_data?.og_image || story.og_image_data?.og_image_url;
  const ogImageData = story.og_image_data || (ogImageUrl ? { og_image: ogImageUrl } : null);

  return {
    content_type: 'story',
    slug: story.slug,
    title: story.title_bn || story.title || story.title_en || story.slug,
    title_en: story.title_en ?? null,
    title_ur: story.title_ur ?? null,
    content: bn || null,
    content_en: en || null,
    content_ur: story.content_ur ?? null,
    moral_bn: story.moral_bn ?? null,
    moral_en: story.moral_en ?? null,
    moral_ur: story.moral_ur ?? null,
    category: story.category || 'General',
    source_name: story.source_name ?? null,
    source_detail: story.source_detail ?? null,
    reference: story.reference ?? null,
    reading_time_minutes: story.reading_time_minutes || estimateReadingMinutes(bn || en),
    seo: (story.seo ?? null) as any,
    navigation: (story.navigation ?? null) as any,
    engagement: (story.engagement ?? null) as any,
    growth: (story.growth ?? null) as any,
    og_image_url: ogImageUrl || null,
    og_image_data: ogImageData as any,
    related_stories:
      (story.navigation?.related_stories ?? story.growth?.related ?? []).map((r: any) => r.slug || r) || null,
    tags: Array.isArray(story.seo?.keywords) ? (story.seo?.keywords as string[]) : (story.tags || null),
    audio_url: story.audio_url ?? null,
    audio_trailer_url: story.audio_trailer_url ?? null,
    status: publish ? 'published' : 'draft',
    is_published: publish,
    ...(publish ? { published_at: new Date().toISOString() } : {}),
    // Use metadata as fallback for columns that might not exist in the DB schema
    metadata: {
      moral_bn: story.moral_bn || null,
      moral_en: story.moral_en || null,
      moral_ur: story.moral_ur || null,
      source_name: story.source_name || null,
      source_detail: story.source_detail || null,
      author: story.author || null,
      reading_time_minutes: story.reading_time_minutes || null,
      tags: story.tags || null,
      is_featured: story.is_featured || false,
      navigation: story.navigation || null,
      engagement: story.engagement || null,
      growth: story.growth || null,
      og_image_url: ogImageUrl || null
    }
  };
}

export function StoryImportPanel({
  canEdit = true,
  onImported,
}: {
  canEdit?: boolean;
  onImported?: (result: StoryImportResult) => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);

  const [dbCount, setDbCount] = useState<number | null>(null);
  const [bundledCount, setBundledCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const refresh = useCallback(async () => {
    const { count } = await supabase
      .from('admin_content')
      .select('id', { count: 'exact', head: true })
      .eq('content_type', 'story');
    setDbCount(count ?? 0);
    const mod = await import('@/data/stories.json');
    setBundledCount((mod.default as unknown as Story[]).length);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const importStories = async (stories: Story[], publish: boolean) => {
    if (!canEdit) {
      toast({ title: 'No permission', variant: 'destructive' });
      return;
    }
    setBusy(true);
    setProgress(0);
    const insertedIds: string[] = [];
    const updatedIds: string[] = [];
    let failed = 0;

    try {
      const { data: existing } = await supabase
        .from('admin_content')
        .select('id, slug')
        .eq('content_type', 'story');
      const bySlug = new Map((existing ?? []).map((r: any) => [r.slug, r.id as string]));

      for (let i = 0; i < stories.length; i++) {
        const story = stories[i];
        if (!story?.slug) {
          failed += 1;
          continue;
        }
        const row = storyRowFromJson(story, publish);
        const existingId = bySlug.get(story.slug);
        try {
          if (existingId) {
            const { status, is_published, published_at, ...rest } = row as any;
            const { error } = await supabase.from('admin_content').update(rest).eq('id', existingId);
            if (error) throw error;
            updatedIds.push(existingId);
          } else {
            const { data, error } = await supabase.from('admin_content').insert(row as any).select('id').single();
            if (error) throw error;
            insertedIds.push(data.id as string);
          }
        } catch (e) {
          failed += 1;
          const errorMsg = e instanceof Error ? e.message : 'Unknown error';
          console.error('Story import failed for', story.slug, errorMsg);
          toast({ 
            title: `Import failed: ${story.slug}`, 
            description: errorMsg, 
            variant: 'destructive' 
          });
        }
        setProgress(Math.round(((i + 1) / stories.length) * 100));
      }

      await queryClient.invalidateQueries({ queryKey: ['admin-content'] });
      await refresh();
      onImported?.({ insertedIds, updatedIds });
      toast({
        title: 'Stories imported',
        description: `${insertedIds.length} new · ${updatedIds.length} updated${failed ? ` · ${failed} failed` : ''}`,
        variant: failed && !insertedIds.length && !updatedIds.length ? 'destructive' : 'default',
      });
    } finally {
      setBusy(false);
    }
  };

  const importBundled = async () => {
    const mod = await import('@/data/stories.json');
    await importStories(mod.default as unknown as Story[], true);
  };

  const importFile = async (file?: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      let list: Story[] | null = null;
      
      if (Array.isArray(parsed)) {
        list = parsed;
      } else if (Array.isArray(parsed.stories)) {
        list = parsed.stories;
      } else if (Array.isArray(parsed.data)) {
        list = parsed.data;
      } else if (Array.isArray(parsed.items)) {
        list = parsed.items;
      }

      if (!list) throw new Error('JSON ফাইলে গল্পের কোনো লিস্ট (Array) পাওয়া যায়নি। দয়া করে সঠিক ফরম্যাট ব্যবহার করুন।');
      await importStories(list, false);
    } catch (e) {
      toast({
        title: 'Invalid JSON',
        description: e instanceof Error ? e.message : 'Could not read file',
        variant: 'destructive',
      });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const exportStories = async () => {
    try {
      setBusy(true);
      const { data, error } = await supabase
        .from('admin_content')
        .select('*')
        .eq('content_type', 'story')
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (!data || data.length === 0) {
        toast({ title: 'No stories found to export', variant: 'destructive' });
        return;
      }

      // Export the complete database rows without whitelisting fields.
      // This preserves nullable columns, nested JSON, metadata, timestamps and future fields.
      const transformedData = data;

      const blob = new Blob([JSON.stringify(transformedData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `islamic-stories-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast({ title: 'Export Successful', description: `${data.length} stories exported.` });
    } catch (e) {
      toast({
        title: 'Export Failed',
        description: e instanceof Error ? e.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="shadow-sm border-border/80 mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" />
              Islamic Story Bulk Management
            </CardTitle>
            <CardDescription>
              Import new stories or export your existing collection as a JSON file.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="rounded-full">
            {dbCount ?? '…'} Stories in Database
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Upload className="h-4 w-4 text-primary" />
              Import Stories
            </h4>
            <p className="text-xs text-muted-foreground">
              Upload a JSON file to add or update stories in bulk.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={() => fileRef.current?.click()} disabled={!canEdit || busy}>
                <Upload className="mr-2 h-3.5 w-3.5" />
                Import JSON
              </Button>
              <Button size="sm" variant="ghost" className="w-full sm:w-auto" onClick={importBundled} disabled={!canEdit || busy}>
                Sync Bundled
              </Button>
            </div>
          </div>

          <div className="p-4 border rounded-lg bg-muted/30 space-y-3">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <Download className="h-4 w-4 text-primary" />
              Export Stories
            </h4>
            <p className="text-xs text-muted-foreground">
              Download all stories from the database as a JSON backup.
            </p>
            <Button size="sm" variant="outline" className="w-full sm:w-auto" onClick={exportStories} disabled={busy}>
              <Download className="mr-2 h-3.5 w-3.5" />
              Export JSON
            </Button>
          </div>
        </div>

        <div className="flex justify-end">
          <Button size="xs" variant="ghost" className="text-[10px] h-6" onClick={refresh} disabled={busy}>
            <RefreshCw className={`mr-1 h-3 w-3 ${busy ? 'animate-spin' : ''}`} />
            Refresh Count
          </Button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => importFile(e.target.files?.[0])}
        />
        {busy && <Progress value={progress} className="h-1" />}
      </CardContent>
    </Card>
  );
}

export default StoryImportPanel;
