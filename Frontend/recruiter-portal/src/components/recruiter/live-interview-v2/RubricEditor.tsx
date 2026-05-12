import { useState, useEffect } from 'react';
import { Sparkles, Loader2, ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { fetchAPI } from '../../../services/client';

interface Dimension {
  name: string;
  weight: number;
  description: string;
  anchors?: {
    substandard: string;
    proficient: string;
    excellent: string;
  };
}

interface RubricEditorProps {
  groupId: string;
  rubricId: string | null;
  isFrozen: boolean;
  onBack: () => void;
  onSave: () => void;
}

export function RubricEditor({ groupId, rubricId, isFrozen, onBack, onSave }: RubricEditorProps) {
  const [dimensions, setDimensions] = useState<Dimension[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rubricId) {
      loadRubric();
    }
  }, [rubricId]);

  const loadRubric = async () => {
    try {
      setIsLoading(true);
      const res = await fetchAPI<{ dimensions?: any[] }>(`/live-interview-v2/rubric/group/${groupId}`);
      if (res && res.dimensions) {
        setDimensions(res.dimensions);
      }
    } catch (e) {
      setError('Failed to load rubric dimensions');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateAnchors = async () => {
    try {
      setIsGenerating(true);
      setError(null);
      // Pass the names of the dimensions
      const res = await fetchAPI<any[]>('/live-interview-v2/rubric/generate-anchors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dimensions: dimensions.map(d => d.name),
        }),
      });
      
      // Merge anchors back into dimensions
      if (res && Array.isArray(res)) {
        const generatedDict = res.reduce((acc: any, d: any) => {
           acc[d.name] = d.anchors;
           return acc;
        }, {});

        setDimensions(prev => prev.map(d => ({
          ...d,
          anchors: generatedDict[d.name] || d.anchors || { substandard: '', proficient: '', excellent: '' }
        })));
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to generate anchors');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateAnchor = (idx: number, level: 'substandard' | 'proficient' | 'excellent', value: string) => {
    const newDims = [...dimensions];
    if (!newDims[idx].anchors) {
      newDims[idx].anchors = { substandard: '', proficient: '', excellent: '' };
    }
    newDims[idx].anchors![level] = value;
    setDimensions(newDims);
  };

  const handleSave = async () => {
    // Validate that all anchors are filled
    for (const d of dimensions) {
      if (!d.anchors || !d.anchors.substandard || !d.anchors.proficient || !d.anchors.excellent) {
        setError(`Please fill all anchors (Substandard, Proficient, Excellent) for dimension "${d.name}"`);
        return;
      }
    }

    try {
      setIsSaving(true);
      setError(null);

      await fetchAPI(`/live-interview-v2/rubric/${rubricId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensions }),
      });

      onSave(); // Proceed to next step
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to save anchors');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" /></div>;
  }

  const needsAnchors = dimensions.some(d => !d.anchors?.proficient);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Define Rubric Anchors</h3>
          <p className="text-sm text-gray-500">Provide behavioral "look-fors" for each score level.</p>
        </div>
        
        {!isFrozen && (
          <button
            onClick={handleGenerateAnchors}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              needsAnchors 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {needsAnchors ? "Generate AI Anchors" : "Regenerate Info"}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-2 border border-red-100">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-8">
        {dimensions.map((dim, idx) => (
          <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 p-4 border-b border-gray-200 flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-gray-900">{dim.name}</h4>
                <p className="text-sm text-gray-500 mt-0.5">{dim.description}</p>
              </div>
              <div className="bg-white px-2.5 py-1 rounded-full border border-gray-200 text-sm font-medium text-gray-600">
                {dim.weight}%
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-200">
              {/* Substandard */}
              <div className="p-4 bg-white">
                <label className="flex items-center gap-2 text-sm font-semibold text-red-700 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-500"></div> Substandard
                </label>
                <textarea
                  value={dim.anchors?.substandard || ''}
                  onChange={(e) => updateAnchor(idx, 'substandard', e.target.value)}
                  disabled={isFrozen}
                  placeholder="Describes a poor response..."
                  className="w-full text-sm resize-none border-0 focus:ring-0 p-0 text-gray-600 disabled:bg-transparent"
                  rows={4}
                />
              </div>
              
              {/* Proficient */}
              <div className="p-4 bg-white">
                <label className="flex items-center gap-2 text-sm font-semibold text-amber-600 mb-2">
                  <div className="w-2 h-2 rounded-full bg-amber-400"></div> Proficient
                </label>
                <textarea
                  value={dim.anchors?.proficient || ''}
                  onChange={(e) => updateAnchor(idx, 'proficient', e.target.value)}
                  disabled={isFrozen}
                  placeholder="Describes an acceptable response..."
                  className="w-full text-sm resize-none border-0 focus:ring-0 p-0 text-gray-600 disabled:bg-transparent"
                  rows={4}
                />
              </div>

              {/* Excellent */}
              <div className="p-4 bg-white">
                <label className="flex items-center gap-2 text-sm font-semibold text-green-700 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-500"></div> Excellent
                </label>
                <textarea
                  value={dim.anchors?.excellent || ''}
                  onChange={(e) => updateAnchor(idx, 'excellent', e.target.value)}
                  disabled={isFrozen}
                  placeholder="Describes an ideal response..."
                  className="w-full text-sm resize-none border-0 focus:ring-0 p-0 text-gray-600 disabled:bg-transparent"
                  rows={4}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" /> Back
        </button>
        
        <button
          onClick={isFrozen ? onSave : handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isFrozen ? (
            <>Continue <ChevronRight className="w-4 h-4" /></>
          ) : (
            <>Save & Continue <ChevronRight className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  );
}
