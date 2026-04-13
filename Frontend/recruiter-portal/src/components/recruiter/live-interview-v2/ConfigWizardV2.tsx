import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, Circle, ChevronRight, Loader2, Sparkles, Save, ShieldAlert } from 'lucide-react';

import { DimensionSelector } from './DimensionSelector';
import { RubricEditor } from './RubricEditor';
import { QuestionBankEditor } from './QuestionBankEditor';
import { FreezeConfirmation } from './FreezeConfirmation';
import { api } from '../../../../services/api'; // Or standard api import used in the project

interface ConfigWizardV2Props {
  groupId: string;
  stageId: string;
  onComplete?: () => void;
}

export function ConfigWizardV2({ groupId, stageId, onComplete }: ConfigWizardV2Props) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [rubricId, setRubricId] = useState<string | null>(null);
  const [bankId, setBankId] = useState<string | null>(null);
  const [isFrozen, setIsFrozen] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const steps = [
    { id: 1, title: 'Dimensions', description: 'Define what to measure' },
    { id: 2, title: 'Rubric Anchors', description: 'Configure scoring behavior' },
    { id: 3, title: 'Question Bank', description: 'Generate AI questions' },
    { id: 4, title: 'Review & Freeze', description: 'Lock configuration' },
  ];

  // Fetch existing config state on mount
  useEffect(() => {
    const checkState = async () => {
      try {
        setIsLoading(true);
        // Try getting existing rubric
        const rubricRes = await api.client.get(`/live-interview-v2/rubric/group/${groupId}`);
        if (rubricRes && rubricRes.rubric_id) {
          setRubricId(rubricRes.rubric_id);
          
          if (rubricRes.state === 'frozen') {
            setIsFrozen(true);
            // Move to bank or freeze step
            try {
              const bankRes = await api.client.get(`/live-interview-v2/bank/group/${groupId}`);
              if (bankRes && bankRes.bank_id) {
                 setBankId(bankRes.bank_id);
                 if (bankRes.state === 'frozen') {
                     setCurrentStep(4); // Fully frozen
                 } else {
                     setCurrentStep(3); // Drafting bank
                 }
              } else {
                setCurrentStep(3); // Needs bank
              }
            } catch (e) {
              setCurrentStep(3); // No bank yet
            }
          } else {
            setCurrentStep(2); // Has draft rubric, move to anchors
          }
        } else {
           setCurrentStep(1); // Nothing exists, start at step 1
        }
      } catch (error) {
        // 404 is expected if not created yet
        setCurrentStep(1);
      } finally {
        setIsLoading(false);
      }
    };
    checkState();
  }, [groupId]);

  const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, 4));
  const handlePrev = () => setCurrentStep(prev => Math.max(prev - 1, 1));

  if (isLoading) {
      return (
          <div className="flex justify-center items-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
      );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header & Stepper */}
      <div className="bg-gray-50/50 border-b border-gray-100 p-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-6">
          <Sparkles className="w-5 h-5 text-indigo-500" />
          AI Interviewer Setup
        </h2>

        <div className="flex items-center justify-between relative">
          <div className="absolute left-0 right-0 top-1/2 h-0.5 bg-gray-200 -z-10 transform -translate-y-1/2"></div>
          {steps.map((step, index) => {
             const isActive = step.id === currentStep;
             const isPast = step.id < currentStep || isFrozen;
             
             return (
              <div key={step.id} className="flex flex-col items-center gap-2 bg-gray-50/50 px-2 py-1">
                <div 
                  className={`w-8 h-8 rounded-full flex items-center justify-center border-2 
                  ${isActive ? 'border-indigo-600 bg-white text-indigo-600' : 
                    isPast ? 'border-green-500 bg-green-500 text-white' : 
                    'border-gray-200 bg-white text-gray-400'}`}
                >
                  {isPast ? <CheckCircle2 className="w-5 h-5" /> : <span className="text-sm font-medium">{step.id}</span>}
                </div>
                <div className="text-center mt-1">
                  <p className={`text-sm font-semibold ${isActive ? 'text-indigo-900' : isPast ? 'text-gray-900' : 'text-gray-400'}`}>
                    {step.title}
                  </p>
                  <p className="text-xs text-gray-500 hidden md:block mt-0.5">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Area */}
      <div className="p-6">
        {isFrozen && currentStep < 4 && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
                <ShieldAlert className="w-5 h-5 text-amber-600 mt-0.5" />
                <div>
                    <h4 className="font-semibold text-amber-800">Configuration is locked</h4>
                    <p className="text-sm text-amber-700 mt-1">
                        This interview configuration has been frozen and can no longer be edited. 
                        You can only view the settings.
                    </p>
                </div>
            </div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {currentStep === 1 && (
              <DimensionSelector 
                groupId={groupId} 
                rubricId={rubricId}
                isFrozen={isFrozen}
                onSave={(id) => { setRubricId(id); handleNext(); }} 
              />
            )}
            
            {currentStep === 2 && (
              <RubricEditor 
                groupId={groupId} 
                rubricId={rubricId}
                isFrozen={isFrozen}
                onBack={handlePrev}
                onSave={() => handleNext()} 
              />
            )}
            
            {currentStep === 3 && (
              <QuestionBankEditor 
                groupId={groupId} 
                rubricId={rubricId}
                bankId={bankId}
                isFrozen={isFrozen}
                onBack={handlePrev}
                onSave={(id) => { setBankId(id); handleNext(); }} 
              />
            )}
            
            {currentStep === 4 && (
              <FreezeConfirmation 
                groupId={groupId} 
                rubricId={rubricId}
                bankId={bankId}
                isFrozen={isFrozen}
                onBack={handlePrev}
                onFreeze={() => { setIsFrozen(true); onComplete?.(); }} 
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
