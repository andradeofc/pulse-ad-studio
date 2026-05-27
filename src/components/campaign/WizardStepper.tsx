import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WizardStepperProps {
  currentStep: number;
  steps: {
    number: number;
    title: string;
  }[];
  onStepClick?: (step: number) => void;
  canNavigateToStep?: (step: number) => boolean;
}

export function WizardStepper({ currentStep, steps, onStepClick, canNavigateToStep }: WizardStepperProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = currentStep > step.number;
          const isActive = currentStep === step.number;
          const isLast = index === steps.length - 1;
          const clickable = !!onStepClick && step.number !== currentStep;
          const allowed = clickable && (canNavigateToStep ? canNavigateToStep(step.number) : true);

          const handleClick = () => {
            if (!onStepClick || step.number === currentStep) return;
            onStepClick(step.number);
          };

          return (
            <div key={step.number} className="flex items-center flex-1 last:flex-none">
              {/* Step Circle */}
              <div className="flex flex-col items-center">
                <motion.button
                  type="button"
                  onClick={handleClick}
                  disabled={!clickable}
                  initial={false}
                  animate={{
                    scale: isActive ? 1.1 : 1,
                  }}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-colors",
                    isCompleted && "step-complete",
                    isActive && "step-active",
                    !isCompleted && !isActive && "step-pending",
                    clickable && allowed && "cursor-pointer hover:ring-2 hover:ring-primary/40",
                    clickable && !allowed && "cursor-not-allowed opacity-80",
                    !clickable && "cursor-default"
                  )}
                  aria-label={`Etapa ${step.number}: ${step.title}`}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    step.number
                  )}
                </motion.button>
                <span className={cn(
                  "mt-2 text-xs font-medium hidden sm:block",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {step.title}
                </span>
              </div>

              {/* Connector Line */}
              {!isLast && (
                <div className="flex-1 h-[2px] mx-2 bg-muted relative">
                  <motion.div
                    initial={false}
                    animate={{
                      width: isCompleted ? '100%' : '0%',
                    }}
                    transition={{ duration: 0.3 }}
                    className="absolute inset-0 bg-primary"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
