// =====================================================
// Leadflow Vloom - ScoringConfig Component
// =====================================================
import React, { useState, useEffect } from 'react';
import {
  Sliders,
  Save,
  RotateCcw,
  Info,
  ChevronDown,
  Check,
} from 'lucide-react';
import type { ScoreWeights, ScoringPreset } from '@/types/database';

interface ScoringConfigProps {
  currentWeights: ScoreWeights;
  presets: ScoringPreset[];
  onSave: (weights: ScoreWeights) => Promise<void>;
  onApplyPreset: (preset: ScoringPreset) => void;
  onSaveAsPreset: (name: string, weights: ScoreWeights) => Promise<void>;
}

const DEFAULT_WEIGHTS: ScoreWeights = {
  has_email: 25,
  has_linkedin: 15,
  company_size_match: 20,
  industry_match: 20,
  recent_posting: 20,
};

const WEIGHT_LABELS: Record<keyof typeof DEFAULT_WEIGHTS, { label: string; description: string }> = {
  has_email: {
    label: 'Has Email',
    description: 'Points added when the contact has an email address',
  },
  has_linkedin: {
    label: 'Has LinkedIn',
    description: 'Points added when the contact has a LinkedIn profile',
  },
  company_size_match: {
    label: 'Company Size Match',
    description: 'Points added when company size matches your target',
  },
  industry_match: {
    label: 'Industry Match',
    description: 'Points added when industry matches your target',
  },
  recent_posting: {
    label: 'Recent Posting',
    description: 'Points added when the job was posted within 7 days',
  },
};

function WeightSlider({
  weightKey,
  value,
  onChange,
  maxValue = 50,
}: {
  weightKey: keyof ScoreWeights;
  value: number;
  onChange: (value: number) => void;
  maxValue?: number;
}) {
  const config = WEIGHT_LABELS[weightKey as keyof typeof WEIGHT_LABELS];
  if (!config) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-gray-900">{config.label}</span>
          <div className="group relative">
            <Info className="w-4 h-4 text-gray-400 cursor-help" />
            <div className="absolute left-0 bottom-full mb-2 w-48 p-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
              {config.description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            onChange={(e) => onChange(Math.max(0, Math.min(maxValue, Number(e.target.value))))}
            className="w-16 px-2 py-1 text-sm text-right border border-gray-200 rounded focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <span className="text-sm text-gray-500">pts</span>
        </div>
      </div>
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={0}
        max={maxValue}
        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
      />
    </div>
  );
}

export function ScoringConfig({
  currentWeights,
  presets,
  onSave,
  onApplyPreset,
  onSaveAsPreset,
}: ScoringConfigProps) {
  const [weights, setWeights] = useState<ScoreWeights>(currentWeights);
  const [isSaving, setIsSaving] = useState(false);
  const [showPresets, setShowPresets] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState('');

  useEffect(() => {
    setWeights(currentWeights);
  }, [currentWeights]);

  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  const hasChanges = JSON.stringify(weights) !== JSON.stringify(currentWeights);

  const handleUpdateWeight = (key: keyof ScoreWeights, value: number) => {
    setWeights(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(weights);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setWeights(DEFAULT_WEIGHTS);
  };

  const handleSaveAsPreset = async () => {
    if (!presetName.trim()) return;
    await onSaveAsPreset(presetName.trim(), weights);
    setPresetName('');
    setShowSavePreset(false);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-purple-500 to-pink-600 flex items-center justify-center">
            <Sliders className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Lead Scoring</h2>
            <p className="text-sm text-gray-500">Configure how leads are prioritized</p>
          </div>
        </div>

        {/* Presets dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowPresets(!showPresets)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
          >
            Presets
            <ChevronDown className="w-4 h-4" />
          </button>

          {showPresets && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowPresets(false)} />
              <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-20">
                {presets.length === 0 ? (
                  <p className="px-3 py-2 text-sm text-gray-500">No presets saved yet</p>
                ) : (
                  presets.map((preset) => (
                    <button
                      key={preset.id}
                      onClick={() => {
                        onApplyPreset(preset);
                        setShowPresets(false);
                      }}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>{preset.name}</span>
                      {preset.is_default && (
                        <Check className="w-4 h-4 text-blue-600" />
                      )}
                    </button>
                  ))
                )}
                <hr className="my-2" />
                <button
                  onClick={() => {
                    setShowSavePreset(true);
                    setShowPresets(false);
                  }}
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 text-blue-600"
                >
                  Save current as preset...
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Save as preset modal */}
      {showSavePreset && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Preset Name
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder="e.g., Startups Priority"
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
            />
            <button
              onClick={handleSaveAsPreset}
              disabled={!presetName.trim()}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setShowSavePreset(false)}
              className="px-4 py-2 text-gray-600 text-sm rounded-lg hover:bg-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Weight sliders */}
      <div className="space-y-6">
        {Object.keys(DEFAULT_WEIGHTS).map((key) => (
          <WeightSlider
            key={key}
            weightKey={key as keyof ScoreWeights}
            value={weights[key] || 0}
            onChange={(value) => handleUpdateWeight(key as keyof ScoreWeights, value)}
          />
        ))}
      </div>

      {/* Total and actions */}
      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="text-sm text-gray-500">Total possible score:</span>
            <span className={`ml-2 text-lg font-semibold ${totalWeight > 100 ? 'text-amber-600' : 'text-gray-900'}`}>
              {totalWeight} pts
            </span>
            {totalWeight > 100 && (
              <span className="ml-2 text-xs text-amber-600">(exceeds 100, scores will be capped)</span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSaving ? 'Saving...' : 'Save & Recalculate'}
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-4 py-2 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-100"
          >
            <RotateCcw className="w-4 h-4" />
            Reset to Default
          </button>
        </div>
      </div>
    </div>
  );
}
