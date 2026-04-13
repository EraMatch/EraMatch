import React, { useState, useEffect } from 'react';
import { Sparkles, Save, Plus, Trash2, AlertCircle, Loader2 } from 'lucide-react';
import { api } from '../../../../services/api';

interface Dimension {
  name: string;
  weight: number;
  description: string;
}

interface DimensionSelectorProps {
  groupId: string;
  rubricId: string | null;
  isFrozen: boolean;
  onSave: (rubricId: string) => void;
}

export function DimensionSelector({ groupId, rubricId, isFrozen, onSave }: DimensionSelectorProps) {
  const [dimensions, setDimensions] = useState<Dimension[]>([
    { name: '', weight: 0, description: '' }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rubricId) {
      loadDraft();
    }
  }, [rubricId]);

  const loadDraft = async () => {
    try {
      setIsLoading(true);
      const res = await api.client.get(`/live-interview-v2/rubric/group/${groupId}`);
      if (res && res.dimensions && res.dimensions.length > 0) {
        setDimensions(res.dimensions);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggest = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await api.client.post('/live-interview-v2/rubric/suggest-dimensions', {
        group_id: groupId
      });
      if (res && res.suggestions) {
        setDimensions(res.suggestions.map((s: any) => ({
          name: s.name,
          weight: s.weight || 0,
          description: s.reason || ''
        })));
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to generate suggestions');
    } finally {
      setIsLoading(false);
    }
  };

  const addDimension = () => {
    setDimensions([...dimensions, { name: '', weight: 0, description: '' }]);
  };

  const removeDimension = (index: number) => {
    setDimensions(dimensions.filter((_, i) => i !== index));
  };

  const updateDimension = (index: number, field: keyof Dimension, value: any) => {
    const newDims = [...dimensions];
    newDims[index] = { ...newDims[index], [field]: value };
    setDimensions(newDims);
  };

  const totalWeight = dimensions.reduce((sum, d) => sum + (Number(d.weight) || 0), 0);

  const handleSave = async () => {
    if (totalWeight !== 100) {
      setError(`Total weight must be 100% (currently ${totalWeight}%)`);
      return;
    }
    if (dimensions.length < 3) {
      setError("Please add at least 3 dimensions.");
      return;
    }
    if (dimensions.some(d => !d.name.trim())) {
      setError("All dimensions must have a name.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      
      let res;
      if (rubricId) {
        res = await api.client.put(`/live-interview-v2/rubric/${rubricId}`, {
           dimensions
        });
      } else {
        res = await api.client.post('/live-interview-v2/rubric', {
           group_id: groupId,
           organization_id: "00000000-0000-0000-0000-000000000000", // Will be filled by backend CurrentUser
           dimensions
        });
      }
      
      if (res && res.rubric_id) {
         onSave(res.rubric_id);
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Failed to save dimensions');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Configure Dimensions</h3>
          <p className="text-sm text-gray-500">Define the core competencies the AI should evaluate.</p>
        </div>
        
        {!isFrozen && (
          <button
            onClick={handleSuggest}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Auto-Suggest with AI
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-2 border border-red-100">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="space-y-4">
        {dimensions.map((dim, idx) => (
          <div key={idx} className="flex flex-col sm:flex-row gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 relative group">
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dimension Name</label>
                  <input
                    type="text"
                    value={dim.name}
                    onChange={(e) => updateDimension(idx, 'name', e.target.value)}
                    disabled={isFrozen}
                    placeholder="e.g., Technical Depth"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
                  />
                </div>
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Weight (%)</label>
                  <input
                    type="number"
                    value={dim.weight || ''}
                    onChange={(e) => updateDimension(idx, 'weight', parseInt(e.target.value) || 0)}
                    disabled={isFrozen}
                    placeholder="0"
                    className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100 text-center"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Description (Reasoning)</label>
                <input
                  type="text"
                  value={dim.description}
                  onChange={(e) => updateDimension(idx, 'description', e.target.value)}
                  disabled={isFrozen}
                  placeholder="Why is this important for the role?"
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:text-sm disabled:bg-gray-100"
                />
              </div>
            </div>
            {!isFrozen && dimensions.length > 1 && (
              <button
                onClick={() => removeDimension(idx)}
                className="absolute -top-2 -right-2 sm:static sm:mt-6 p-1.5 text-gray-400 hover:text-red-600 bg-white sm:bg-transparent rounded-full shadow-sm sm:shadow-none border sm:border-none border-gray-200 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!isFrozen && (
        <button
          onClick={addDimension}
          className="flex items-center gap-1 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          <Plus className="w-4 h-4" />
          Add Dimension
        </button>
      )}

      <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-700">Total Weight:</span>
          <span className={`text-lg font-bold ${totalWeight === 100 ? 'text-green-600' : 'text-red-500'}`}>
            {totalWeight}%
          </span>
          {totalWeight !== 100 && (
            <span className="text-xs text-red-500 ml-2">(Must equal 100%)</span>
          )}
        </div>
        
        <button
          onClick={handleSave}
          disabled={isSaving || isFrozen}
          className="flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {isSaving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isFrozen ? (
            'Locked'
          ) : (
            <>Save & Continue <ChevronRight className="w-4 h-4" /></>
          )}
        </button>
      </div>
    </div>
  );
}

// Ensure ChevronRight is imported (or replace with local SVG if missing)
import { ChevronRight } from 'lucide-react';
