import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface TrendChartProps {
    data: { date: string; accuracy: number }[];
}

const TrendChart: React.FC<TrendChartProps> = ({ data }) => {
    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart
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
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'sans-serif' }}
                        dy={10}
                    />
                    <YAxis
                        domain={[0, 100]}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#64748b', fontSize: 11, fontFamily: 'sans-serif' }}
                        tickFormatter={(value) => `${value}%`}
                    />
                    <Tooltip
                        cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
                        contentStyle={{
                            backgroundColor: '#fff',
                            borderRadius: '6px',
                            border: '1px solid #e2e8f0',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                            fontFamily: 'sans-serif',
                            fontSize: '12px'
                        }}
                        formatter={(value: number) => [`${value}%`, 'Average Accuracy']}
                        labelStyle={{ color: '#64748b', marginBottom: '4px' }}
                    />
                    <Line
                        type="monotone"
                        dataKey="accuracy"
                        stroke="#1d4ed8" /* academy-600 */
                        strokeWidth={3}
                        dot={{ r: 4, fill: '#1d4ed8', strokeWidth: 2, stroke: '#fff' }}
                        activeDot={{ r: 6, fill: '#1d4ed8', strokeWidth: 0 }}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
};

export default TrendChart;
