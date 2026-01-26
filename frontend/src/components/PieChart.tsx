'use client';

import { Pie } from 'react-chartjs-2';
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

interface PieChartProps {
    data: { [key: string]: number };
    title?: string;
}

const COLORS = [
    '#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8',
    '#82ca9d', '#ffc658', '#ff7300', '#00ff00', '#ff00ff'
];

export default function PieChart({ data, title }: PieChartProps) {
    const labels = Object.keys(data);
    const values = Object.values(data);
    const total = values.reduce((sum, val) => sum + val, 0);

    if (labels.length === 0 || total === 0) {
        return (
            <div className="text-center py-5 text-muted">
                No data to display
            </div>
        );
    }

    const chartData = {
        labels: labels.map((label, i) => {
            const percentage = ((values[i] / total) * 100).toFixed(1);
            return `${label} - ₹${values[i].toFixed(2)} (${percentage}%)`;
        }),
        datasets: [
            {
                data: values,
                backgroundColor: COLORS.slice(0, labels.length),
                borderColor: COLORS.slice(0, labels.length).map(c => c),
                borderWidth: 1,
            },
        ],
    };

    const options = {
        responsive: true,
        plugins: {
            legend: {
                position: 'bottom' as const,
                labels: {
                    color: '#fff',
                    padding: 15,
                    font: {
                        size: 12,
                    },
                },
            },
            tooltip: {
                callbacks: {
                    label: function (context: any) {
                        const value = context.parsed;
                        const percentage = ((value / total) * 100).toFixed(1);
                        return `₹${value.toFixed(2)} (${percentage}%)`;
                    },
                },
            },
        },
    };

    return (
        <div className="card card-dark p-3" style={{ backgroundColor: '#1f1f1f', border: 'none' }}>
            {title && <h5 className="text-center text-white mb-3">{title}</h5>}
            <div className="text-center mb-2 text-white">
                <strong>Total: ₹{total.toFixed(2)}</strong>
            </div>
            <Pie data={chartData} options={options} />
        </div>
    );
}
