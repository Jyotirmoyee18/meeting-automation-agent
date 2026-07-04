
import React from 'react';
import { ActionItem } from '../types';

interface ActionItemViewProps {
  actionItems: ActionItem[];
}

const ActionItemView: React.FC<ActionItemViewProps> = ({ actionItems }) => {
  const getPriorityColor = (priority: string) => {
    switch (priority.toLowerCase()) {
      case 'high': return 'bg-red-100 text-red-700 border-red-200';
      case 'medium': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'low': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <i className="fas fa-tasks text-emerald-500"></i>
          <h3 className="font-bold text-slate-800">Extracted Action Items</h3>
        </div>
        <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2 py-1 rounded-md">
          {actionItems.length} Tasks
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        {actionItems.map((item) => (
          <div key={item.id} className="p-4 hover:bg-slate-50 transition-colors flex items-start gap-4">
            <div className="mt-1">
              <input type="checkbox" className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
            </div>
            <div className="flex-1">
              <p className="text-slate-800 font-medium mb-2">{item.task}</p>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-slate-500">
                  <i className="fas fa-user-circle text-xs"></i>
                  <span className="text-xs font-semibold">{item.assignee}</span>
                </div>
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getPriorityColor(item.priority)}`}>
                  {item.priority}
                </span>
              </div>
            </div>
            <button className="text-slate-300 hover:text-slate-500 transition-colors">
              <i className="fas fa-ellipsis-v"></i>
            </button>
          </div>
        ))}
      </div>
      {actionItems.length === 0 && (
        <div className="p-10 text-center text-slate-400">
          <p>No action items identified.</p>
        </div>
      )}
    </div>
  );
};

export default ActionItemView;
