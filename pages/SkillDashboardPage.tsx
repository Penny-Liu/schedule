import React, { useState, useEffect, useMemo } from 'react';
import { User } from '../types';
import { db } from '../services/store';
import { RADIOGRAPHER_SKILLS, SKILL_CATEGORIES } from '../services/skills';
import { 
  Users, 
  User as UserIcon,
  Star,
  BookOpen,
  Copy,
  Activity,
  Brain,
  Bone,
  Heart,
  Baby,
  Stethoscope,
  Scan,
  ScanLine
} from 'lucide-react';
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip
} from 'recharts';

interface SkillDashboardPageProps {
  currentUser: User;
}

// Map skill ID to specific lucide icons for the professional look
const getSkillIcon = (id: string, category: string) => {
  if (category === 'Routine') return <Bone size={24} />;
  if (category === 'CT') return <Brain size={24} />;
  if (category === 'MRI') return <ScanLine size={24} />;
  if (category === 'Sono') {
    if (id === 'S2') return <Baby size={24} />;
    if (id === 'S4') return <Heart size={24} />;
    return <Scan size={24} />;
  }
  if (category === 'Mammo') return <Activity size={24} />;
  return <Stethoscope size={24} />;
};

const SkillDashboardPage: React.FC<SkillDashboardPageProps> = ({ currentUser }) => {
  const [activeTab, setActiveTab] = useState<'personal' | 'team'>('team');
  const [radiographers, setRadiographers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>(currentUser.id);

  useEffect(() => {
    const loadUsers = () => {
      const allUsers = db.getUsers();
      setRadiographers(allUsers.filter(u => u.isRadiographer && u.isActive !== false && !u.isPartTime));
    };
    loadUsers();
    return db.subscribe(loadUsers);
  }, []);

  const selectedUser = useMemo(() => {
    return radiographers.find(u => u.id === selectedUserId) || currentUser;
  }, [radiographers, selectedUserId, currentUser]);

  // Transform data for Radar Chart
  const radarData = useMemo(() => {
    return SKILL_CATEGORIES.map(category => {
      const skillsInCategory = RADIOGRAPHER_SKILLS.filter(s => s.category === category);
      const total = skillsInCategory.length;
      let unlocked = 0;
      
      if (selectedUser.unlockedSkills) {
        skillsInCategory.forEach(s => {
          if (selectedUser.unlockedSkills?.includes(s.id)) unlocked++;
        });
      }
      
      return {
        subject: category,
        A: total === 0 ? 0 : Math.round((unlocked / total) * 100),
        fullMark: 100,
        unlocked,
        total
      };
    });
  }, [selectedUser]);

  const totalSkills = RADIOGRAPHER_SKILLS.length;
  const unlockedCount = selectedUser.unlockedSkills?.length || 0;
  const completionRate = Math.round((unlockedCount / totalSkills) * 100);

  const getMasteryLabel = (rate: number) => {
    if (rate === 100) return 'Expert';
    if (rate >= 75) return 'Advanced';
    if (rate >= 50) return 'Intermediate';
    if (rate >= 25) return 'Novice';
    return 'Beginner';
  };

  const handleCopyLineReport = () => {
    const reportLines = radiographers.map(user => {
      const userUnlockedCount = user.unlockedSkills?.length || 0;
      
      const getCatCount = (cat: string) => {
        const skillsInCat = RADIOGRAPHER_SKILLS.filter(s => s.category === cat);
        return skillsInCat.filter(s => user.unlockedSkills?.includes(s.id)).length;
      };

      const r = getCatCount('Routine');
      const c = getCatCount('CT');
      const m = getCatCount('MRI');
      const s = getCatCount('Sono');
      const mg = getCatCount('Mammo');

      return `${user.name} R${r} C${c} M${m} S${s} MG${mg} \n→${userUnlockedCount}`;
    });

    const textToCopy = reportLines.join('\n\n');
    navigator.clipboard.writeText(textToCopy);
    alert('Line報表已複製到剪貼簿！');
  };

  // SVG Circular Progress
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (completionRate / 100) * circumference;

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-800 overflow-hidden font-sans">
      {/* Header */}
      <div className="px-8 py-4 bg-white border-b border-slate-200 flex items-center justify-between z-10">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">
            Radiographer Mastery Dashboard
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">Professional Skill Development Matrix</p>
        </div>
        
        <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
          <button
            onClick={() => setActiveTab('team')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-bold text-sm transition-all duration-200 ${
              activeTab === 'team' 
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Users size={16} />
            團隊矩陣
          </button>
          <button
            onClick={() => setActiveTab('personal')}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-md font-bold text-sm transition-all duration-200 ${
              activeTab === 'personal' 
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <UserIcon size={16} />
            個人戰力
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-8">
        {activeTab === 'personal' && (
          <div className="max-w-7xl mx-auto space-y-8">
            {/* View Selector for Admin/Supervisors */}
            {(currentUser.role === 'SYSTEM_ADMIN' || currentUser.role === 'SUPERVISOR') && (
              <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-sm">
                <span className="text-slate-500 font-bold text-sm whitespace-nowrap pl-2">檢視對象：</span>
                <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide flex-1">
                  {radiographers.map(u => (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUserId(u.id)}
                      className={`px-4 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all border ${
                        selectedUserId === u.id
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {u.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Top Row: Mastery Score & Radar Chart */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Mastery Score Card */}
              <div className="lg:col-span-1 bg-[#2563eb] rounded-2xl p-8 shadow-sm flex flex-col justify-center relative overflow-hidden text-white">
                <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] rounded-full bg-blue-500/50 blur-[50px] pointer-events-none" />
                <h2 className="text-xl font-medium mb-6 opacity-90 tracking-wide z-10">Mastery Score</h2>
                
                <div className="flex items-center gap-6 z-10">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    {/* Background Circle */}
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="transparent"
                        stroke="rgba(255,255,255,0.2)"
                        strokeWidth="8"
                      />
                      {/* Progress Circle */}
                      <circle
                        cx="50"
                        cy="50"
                        r={radius}
                        fill="transparent"
                        stroke="#ffffff"
                        strokeWidth="8"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        strokeLinecap="round"
                        className="transition-all duration-1000 ease-out"
                      />
                    </svg>
                  </div>
                  
                  <div>
                    <div className="text-3xl font-bold flex items-baseline gap-2">
                      {completionRate}
                      <span className="text-lg opacity-80 font-normal">/ 100</span>
                    </div>
                    <div className="text-lg font-medium opacity-90 mt-1">
                      - {getMasteryLabel(completionRate)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Radar Chart Card */}
              <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
                <h2 className="text-lg font-bold text-slate-800 mb-2">Skill Proficiency Radar Chart</h2>
                <div className="flex-1 min-h-[200px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#475569', fontSize: 12, fontWeight: '500' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#ffffff', borderColor: '#cbd5e1', borderRadius: '8px', color: '#1e293b' }}
                        formatter={(value: number, name: string, props: any) => [`${props.payload.unlocked} / ${props.payload.total} 項`, '解鎖進度']}
                      />
                      <Radar
                        name="Skill Match"
                        dataKey="A"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="#3b82f6"
                        fillOpacity={0.2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Bottom Area: Skill Cards by Category */}
            <div className="space-y-8">
              {SKILL_CATEGORIES.map(category => {
                const categorySkills = RADIOGRAPHER_SKILLS.filter(s => s.category === category);
                if (categorySkills.length === 0) return null;

                return (
                  <div key={category}>
                    <h3 className="text-xl font-bold text-slate-800 mb-4 tracking-tight">{category}</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
                      {categorySkills.map(skill => {
                        const isUnlocked = selectedUser.unlockedSkills?.includes(skill.id);
                        const isLearning = selectedUser.learningSkills?.includes(skill.id);
                        
                        let levelText = "Not Started";
                        let progress = 0;
                        let btnText = "Unlock Next Level";
                        let btnClass = "bg-blue-600 hover:bg-blue-700 text-white";

                        if (isUnlocked) {
                          levelText = "Certified (100%)";
                          progress = 100;
                          btnText = "Max Level";
                          btnClass = "bg-slate-100 text-slate-400 cursor-default";
                        } else if (isLearning) {
                          levelText = "Learning (50%)";
                          progress = 50;
                          btnText = "Continue Learning";
                          btnClass = "bg-blue-100 text-blue-700 hover:bg-blue-200 font-semibold";
                        }

                        return (
                          <div key={skill.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col items-center text-center transition-shadow hover:shadow-md">
                            <div className="w-14 h-14 rounded-2xl bg-[#1e3a8a] text-white flex items-center justify-center mb-4 shadow-sm">
                              {getSkillIcon(skill.id, category)}
                            </div>
                            
                            <h4 className="font-bold text-slate-800 text-[13px] leading-tight min-h-[2.5rem] flex items-center justify-center mb-2">
                              {skill.id}: {skill.name}
                            </h4>
                            
                            <div className="w-full mt-auto">
                              <div className="flex justify-start text-[11px] font-bold text-slate-600 mb-1.5">
                                {levelText}
                              </div>
                              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden mb-4">
                                <div 
                                  className="h-full bg-blue-600 rounded-full transition-all duration-500"
                                  style={{ width: `${progress}%` }}
                                />
                              </div>
                              
                              <button className={`w-full py-2 rounded-md text-xs transition-colors ${btnClass}`}>
                                {btnText}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}

        {activeTab === 'team' && (
          <div className="max-w-7xl mx-auto">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Users size={18} className="text-blue-600" /> 團隊矩陣總覽
                </h3>
                <div className="flex gap-4 text-xs font-semibold text-slate-500">
                  <span className="flex items-center gap-1.5"><Star size={14} className="text-blue-600 fill-blue-600" /> 具備</span>
                  <span className="flex items-center gap-1.5"><BookOpen size={14} className="text-blue-300" /> 學習中</span>
                  <span className="flex items-center gap-1.5"><div className="w-2.5 h-2.5 rounded-full bg-slate-200" /> 未具備</span>
                </div>
              </div>
              
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 font-bold sticky left-0 bg-slate-50 border-r border-slate-200 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">放射師</th>
                      {SKILL_CATEGORIES.map(cat => {
                        const count = RADIOGRAPHER_SKILLS.filter(s => s.category === cat).length;
                        return (
                          <th key={cat} colSpan={count} className="px-4 py-2 border-r border-slate-200 text-center font-bold tracking-wider">
                            {cat}
                          </th>
                        );
                      })}
                      <th className="px-4 py-3 font-bold text-center border-l border-slate-200 sticky right-0 bg-slate-50 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]">完成度</th>
                    </tr>
                    <tr>
                      <th className="px-4 py-2 sticky left-0 bg-slate-50 border-r border-slate-200 z-20 shadow-[2px_0_5px_rgba(0,0,0,0.02)]"></th>
                      {SKILL_CATEGORIES.map(cat => (
                        RADIOGRAPHER_SKILLS.filter(s => s.category === cat).map(skill => (
                          <th key={skill.id} className="px-1.5 py-2 border-r border-slate-200 border-t border-t-slate-100 text-center font-mono text-[10px] w-12" title={skill.name}>
                            {skill.id}
                          </th>
                        ))
                      ))}
                      <th className="px-4 py-2 sticky right-0 bg-slate-50 border-l border-slate-200 border-t border-t-slate-100 shadow-[-2px_0_5px_rgba(0,0,0,0.02)]"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {radiographers.map(user => {
                      const unlockedCount = user.unlockedSkills?.length || 0;
                      const rate = Math.round((unlockedCount / totalSkills) * 100);
                      
                      return (
                        <tr key={user.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 font-bold text-slate-700 sticky left-0 bg-white border-r border-slate-200 z-10 whitespace-nowrap flex items-center gap-2 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black border text-white"
                                 style={{ backgroundColor: user.color || '#4f46e5', borderColor: user.color || '#4f46e5' }}>
                              {user.alias || user.name.charAt(0)}
                            </div>
                            {user.name}
                          </td>
                          
                          {SKILL_CATEGORIES.map(cat => (
                            RADIOGRAPHER_SKILLS.filter(s => s.category === cat).map(skill => {
                              const isUnlocked = user.unlockedSkills?.includes(skill.id);
                              const isLearning = user.learningSkills?.includes(skill.id);
                              
                              return (
                                <td key={`${user.id}-${skill.id}`} className="px-1.5 py-2.5 border-r border-slate-100 text-center">
                                  {isUnlocked ? (
                                    <div className="flex justify-center"><Star size={16} className="text-blue-600 fill-blue-600" /></div>
                                  ) : isLearning ? (
                                    <div className="flex justify-center"><BookOpen size={16} className="text-blue-300" /></div>
                                  ) : (
                                    <div className="flex justify-center"><div className="w-2 h-2 rounded-full bg-slate-200" /></div>
                                  )}
                                </td>
                              );
                            })
                          ))}
                          
                          <td className="px-4 py-2.5 sticky right-0 bg-white border-l border-slate-200 shadow-[-2px_0_5px_rgba(0,0,0,0.02)] text-center">
                            <div className="flex flex-col items-center gap-1 justify-center">
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400">{unlockedCount}/{totalSkills}</span>
                                <span className="text-xs font-black text-blue-600 w-8 text-right">{rate}%</span>
                              </div>
                              <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500" style={{ width: `${rate}%` }} />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end">
                <button
                  onClick={handleCopyLineReport}
                  className="flex items-center gap-2 px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded-lg text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
                >
                  <Copy size={16} className="text-slate-500" />
                  複製 Line 報表
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillDashboardPage;
