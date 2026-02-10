import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { Megaphone, Users, Target, TrendingUp } from 'lucide-react';

interface CounterProps {
  from: number;
  to: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}

function AnimatedCounter({ from, to, suffix = '', prefix = '', duration = 2 }: CounterProps) {
  const count = useMotionValue(from);
  const rounded = useTransform(count, (v) => {
    if (v >= 1000) return `${(v / 1000).toFixed(1)}k`;
    return Math.round(v).toLocaleString('pt-BR');
  });
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const controls = animate(count, to, {
      duration,
      ease: 'easeOut',
    });
    return controls.stop;
  }, [count, to, duration]);

  return (
    <span className="tabular-nums">
      {prefix}
      <motion.span ref={ref}>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

const stats = [
  {
    icon: Megaphone,
    value: 12500,
    suffix: '+',
    label: 'Campanhas Criadas',
  },
  {
    icon: Users,
    value: 850,
    suffix: '+',
    label: 'Anunciantes Ativos',
  },
  {
    icon: Target,
    value: 3200,
    suffix: '+',
    label: 'Contas Gerenciadas',
  },
  {
    icon: TrendingUp,
    value: 98,
    suffix: '%',
    label: 'Taxa de Aprovação',
  },
];

export function SocialProofSection() {
  return (
    <section className="py-16 border-b border-border">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-2 md:grid-cols-4 gap-8"
        >
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="text-center"
            >
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <stat.icon className="w-6 h-6 text-primary" />
              </div>
              <p className="text-3xl md:text-4xl font-bold text-foreground mb-1">
                <AnimatedCounter from={0} to={stat.value} suffix={stat.suffix} />
              </p>
              <p className="text-sm text-muted-foreground">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
