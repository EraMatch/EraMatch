import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, ChevronLeft, ChevronRight, AlertCircle, Trash2, Plus, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchAPI } from '../../../services/client';

interface SubCriterion {
  name: string;
  description: string;
}

interface BankItem {
  question_id: string;
  dimension_name: string;
  text: string;
  intent: string;
  sub_criteria: SubCriterion[];
}

interface QuestionBankEditorProps {
  groupId: string;
  rubricId: string | null;
  bankId: string | null;
  isFrozen: boolean;
  onBack: () => void;
  onSave: (bankId: string) => void;
}

export function QuestionBankEditor({ groupId, rubricId, bankId, isFrozen, onBack, onSave }: QuestionBankEditorProps) {
  const [items, setItems] = useState<BankItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (bankId) {
      loadBank();
    } else {
      setIsLoading(false);
    }
  }, [bankId]);

  const loadBank = async () => {
    try {
      setIsLoading(true);
      const res = await fetchAPI<{ items?: BankItem[] }>(`/live-interview-v2/bank/group/${groupId}`);
      if (res && res.items) {
        setItems(res.items);
      }
    } catch (e) {
      setError('Failed to load question bank');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateBank = async () => {
    if (!rubricId) {
      setError("Cannot generate bank without a saved rubric.");
      return;
    }
    try {
      setIsGenerating(true);
      setError(null);
      const res = await fetchAPI<{ items?: BankItem[] }>('/live-interview-v2/bank/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rubric_id: rubricId
        }),
      });
      if (res && res.items) {
        setItems(res.items);
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to generate question bank');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async () => {
    if (items.length === 0) {
      setError("Cannot save an empty question bank.");
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      
      let res;
      if (bankId) {
        res = await fetchAPI<{ bank_id?: string }>(`/live-interview-v2/bank/${bankId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items }),
        });
      } else {
        res = await fetchAPI<{ bank_id?: string }>('/live-interview-v2/bank', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            group_id: groupId,
            organization_id: "00000000-0000-0000-0000-000000000000",
            items
          }),
        });
      }
      
      if (res && res.bank_id) {
         onSave(res.bank_id);
      }
    } catch (e: any) {
      setError(e instanceof Error ? e.message : 'Failed to save question bank');
    } finally {
      setIsSaving(false);
    }
  };

  const updateItem = (index: number, field: keyof BankItem, value: any) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [field]: value };
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const toggleExpand = (id: string) => {
    const newExp = new Set(expandedCards);
    if (newExp.has(id)) newExp.delete(id);
    else newExp.add(id);
    setExpandedCards(newExp);
  };

  if (isLoading) {
    return <div className="p-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-indigo-600" /></div>;
  }

  // Group items by dimension
  const groupedItems = items.reduce((acc, item) => {
     if (!acc[item.dimension_name]) acc[item.dimension_name] = [];
     acc[item.dimension_name].push(item);
     return acc;
  }, {} as Record<string, BankItem[]>);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-medium text-gray-900">Question Bank</h3>
          <p className="text-sm text-gray-500">Review the AI-generated questions and evaluation criteria.</p>
        </div>
        
        {!isFrozen && (
          <button
            onClick={handleGenerateBank}
            disabled={isGenerating}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              items.length === 0 
                ? 'bg-indigo-600 text-white hover:bg-indigo-700' 
                : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
            }`}
          >
            {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {items.length === 0 ? "Generate Question Bank" : "Regenerate All"}
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-2 border border-red-100">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      {items.length === 0 && !isGenerating && !error && (
         <div className="text-center py-12 bg-gray-50 border border-dashed border-gray-300 rounded-xl">
             <MessageSquare className="w-10 h-10 text-gray-400 mx-auto mb-3" />
             <h4 className="text-sm font-medium text-gray-900">No questions yet</h4>
             <p className="text-sm text-gray-500 mt-1">Click Generate to build the interview script.</p>
         </div>
      )}

      <div className="space-y-8">
         {Object.entries(groupedItems).map(([dimName, dimItems]) => (
            <div key={dimName} className="space-y-4">
              <h4 className="font-semibold text-gray-900 border-b border-gray-200 pb-2">{dimName}</h4>
              
              {dimItems.map((item, localIdx) => {
                 const overallIdx = items.findIndex(i => i.question_id === item.question_id);
                 const isExp = expandedCards.has(item.question_id);
                 
                 return (
                  <div key={item.question_id} className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    {/* Header: Question Text */}
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex gap-4">
                       <span className="text-sm font-bold text-gray-400 mt-1">Q</span>
                       <textarea 
                          value={item.text}
                          onChange={(e) => updateItem(overallIdx, 'text', e.target.value)}
                          disabled={isFrozen}
                          placeholder="Interview question..."
                          className="flex-1 text-base font-medium text-gray-900 bg-transparent border-0 focus:ring-0 p-0 resize-none rounded disabled:bg-transparent"
                          rows={2}
                       />
                       {!isFrozen && (
                         <button onClick={() => removeItem(overallIdx)} className="text-gray-400 hover:text-red-600 transition-colors self-start mt-1">
                           <Trash2 className="w-4 h-4" />
                         </button>
                       )}
                    </div>
                    
                    {/* Toggle Details */}
                    <button 
                      onClick={() => toggleExpand(item.question_id)}
                      className="w-full px-4 py-2 bg-white text-xs font-medium text-indigo-600 flex flex-row items-center justify-center gap-1 hover:bg-gray-50"
                    >
                      {isExp ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {isExp ? "Hide intent & rubric" : "View intent & rubric"}
                    </button>

                    {/* Details Body */}
                    {isExp && (
                      <div className="p-4 pt-2 border-t border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-2">
                         <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">Question Intent</label>
                            <input 
                              value={item.intent}
                              onChange={(e) => updateItem(overallIdx, 'intent', e.target.value)}
                              disabled={isFrozen}
                              className="w-full text-sm text-gray-600 bg-white border border-gray-200 rounded-md p-2 focus:ring-1 focus:ring-indigo-500 disabled:bg-gray-50"
                            />
                         </div>
                         
                         <div>
                            <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-2">Look-for Criteria (AI Judge)</label>
                            <ul className="space-y-2">
                               {item.sub_criteria.map((sc, scIdx) => (
                                  <li key={scIdx} className="flex gap-2">
                                     <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0"></div>
                                     <div className="flex-1">
                                        <p className="text-sm font-medium text-gray-800">{sc.name}</p>
                                        <p className="text-sm text-gray-500">{sc.description}</p>
                                     </div>
                                  </li>
                               ))}
                            </ul>
                         </div>
                      </div>
                    )}
                  </div>
                 );
              })}
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
          onClick={handleSave}
          disabled={isSaving || isFrozen}
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
