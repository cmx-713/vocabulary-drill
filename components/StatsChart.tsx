import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface StatsChartProps {
  data: { name: string; score: number }[];
}

const StatsChart: React.FC<StatsChartProps> = ({ data }) => {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{
            top: 5,
            right: 10,
            left: -20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis 
            dataKey="name" 
            axisLine={false} 
            tickLine={false} 
            tick={{fill: '#64748b', fontSize: 11, fontFamily: 'sans-serif'}}
            dy={10}
          />
          <YAxis 
            axisLine={false} 
            tickLine={false} 
            tick={{fill: '#64748b', fontSize: 11, fontFamily: 'sans-serif'}}
          />
          <Tooltip 
            cursor={{fill: '#f8fafc'}}
            contentStyle={{ 
              backgroundColor: '#fff',
              borderRadius: '6px', 
              border: '1px solid #e2e8f0', 
              boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
              fontFamily: 'serif'
            }}
          />
          <Bar dataKey="score" radius={[2, 2, 0, 0]} barSize={40}>
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.score >= 80 ? '#1e3a8a' : '#cbd5e1'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StatsChart;