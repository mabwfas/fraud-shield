// FraudShield - API Module with ML Scoring
const ShieldAPI = {
    storage: {
        get(key, def = null) { try { return JSON.parse(localStorage.getItem(`shield_${key}`)) || def; } catch { return def; } },
        set(key, val) { localStorage.setItem(`shield_${key}`, JSON.stringify(val)); }
    },

    orders: {
        getAll() { return ShieldAPI.storage.get('orders', []); },
        save(orders) { ShieldAPI.storage.set('orders', orders); },
        add(order) {
            const orders = this.getAll();
            order.id = 'ORD-' + Date.now().toString(36).toUpperCase();
            order.createdAt = new Date().toISOString();
            order.riskScore = ShieldAPI.calculateRisk(order);
            order.riskLevel = order.riskScore >= 70 ? 'high' : order.riskScore >= 40 ? 'medium' : 'low';
            order.status = 'pending';
            orders.unshift(order);
            this.save(orders);
            return order;
        },
        approve(id) { return this.updateStatus(id, 'approved'); },
        block(id) { return this.updateStatus(id, 'blocked'); },
        updateStatus(id, status) {
            const orders = this.getAll();
            const order = orders.find(o => o.id === id);
            if (order) { order.status = status; order.reviewedAt = new Date().toISOString(); this.save(orders); return order; }
            return null;
        }
    },

    rules: {
        getAll() { return ShieldAPI.storage.get('rules', this.defaults()); },
        save(rules) { ShieldAPI.storage.set('rules', rules); },
        defaults() {
            return [
                { id: 'new_customer', name: 'New Customer', description: 'First-time buyer', weight: 15, enabled: true },
                { id: 'high_amount', name: 'High Order Value', description: 'Order over $500', weight: 20, enabled: true, threshold: 500 },
                { id: 'email_mismatch', name: 'Suspicious Email', description: 'Disposable or suspicious email', weight: 25, enabled: true },
                { id: 'high_risk_country', name: 'High-Risk Country', description: 'Order from flagged region', weight: 30, enabled: true },
                { id: 'velocity', name: 'Order Velocity', description: 'Multiple orders in short time', weight: 25, enabled: true },
                { id: 'payment_mismatch', name: 'Payment Mismatch', description: 'Billing/shipping mismatch', weight: 20, enabled: true },
                { id: 'proxy_vpn', name: 'Proxy/VPN Detected', description: 'Connection via proxy or VPN', weight: 35, enabled: true }
            ];
        },
        toggle(id) {
            const rules = this.getAll();
            const rule = rules.find(r => r.id === id);
            if (rule) { rule.enabled = !rule.enabled; this.save(rules); return rule; }
            return null;
        },
        updateWeight(id, weight) {
            const rules = this.getAll();
            const rule = rules.find(r => r.id === id);
            if (rule) { rule.weight = weight; this.save(rules); return rule; }
            return null;
        }
    },

    calculateRisk(order) {
        const rules = this.rules.getAll();
        let score = 0;
        const triggered = [];

        if (rules.find(r => r.id === 'new_customer')?.enabled && order.isNewCustomer) {
            score += rules.find(r => r.id === 'new_customer').weight;
            triggered.push('new_customer');
        }

        const highAmountRule = rules.find(r => r.id === 'high_amount');
        if (highAmountRule?.enabled && order.amount >= (highAmountRule.threshold || 500)) {
            score += highAmountRule.weight;
            triggered.push('high_amount');
        }

        if (rules.find(r => r.id === 'email_mismatch')?.enabled) {
            const suspiciousDomains = ['tempmail', 'throwaway', 'fake', 'temp', '10minute'];
            if (suspiciousDomains.some(d => order.email?.toLowerCase().includes(d))) {
                score += rules.find(r => r.id === 'email_mismatch').weight;
                triggered.push('email_mismatch');
            }
        }

        if (rules.find(r => r.id === 'high_risk_country')?.enabled) {
            const highRiskCountries = ['Nigeria', 'Ghana', 'Indonesia', 'Vietnam'];
            if (highRiskCountries.includes(order.country)) {
                score += rules.find(r => r.id === 'high_risk_country').weight;
                triggered.push('high_risk_country');
            }
        }

        if (rules.find(r => r.id === 'payment_mismatch')?.enabled && order.billingMismatch) {
            score += rules.find(r => r.id === 'payment_mismatch').weight;
            triggered.push('payment_mismatch');
        }

        // ML-style pattern scoring
        score = this.applyMLPattern(order, score);

        order.triggeredRules = triggered;
        return Math.min(100, score);
    },

    applyMLPattern(order, baseScore) {
        // Simulated ML adjustments based on patterns
        let adjustment = 0;

        // Time-based patterns
        const hour = new Date().getHours();
        if (hour >= 2 && hour <= 5) adjustment += 10; // Late night orders

        // Amount patterns
        if (order.amount % 100 === 0) adjustment += 5; // Round numbers
        if (order.amount > 1000) adjustment += 10;

        // Email patterns
        if (order.email?.match(/\d{5,}/)) adjustment += 10; // Many numbers in email

        return baseScore + adjustment;
    },

    getAnalytics() {
        const orders = this.orders.getAll();
        const high = orders.filter(o => o.riskLevel === 'high');
        const medium = orders.filter(o => o.riskLevel === 'medium');
        const low = orders.filter(o => o.riskLevel === 'low');
        const blocked = orders.filter(o => o.status === 'blocked');
        const approved = orders.filter(o => o.status === 'approved');

        return {
            total: orders.length,
            high: high.length,
            medium: medium.length,
            low: low.length,
            blocked: blocked.length,
            approved: approved.length,
            pending: orders.filter(o => o.status === 'pending').length,
            avgRisk: orders.length ? orders.reduce((s, o) => s + o.riskScore, 0) / orders.length : 0,
            blockedValue: blocked.reduce((s, o) => s + (o.amount || 0), 0)
        };
    },

    format: {
        currency(n) { return '$' + Number(n).toFixed(2); },
        timeAgo(date) {
            const s = Math.floor((new Date() - new Date(date)) / 1000);
            if (s < 60) return 'Just now';
            if (s < 3600) return Math.floor(s / 60) + 'm ago';
            if (s < 86400) return Math.floor(s / 3600) + 'h ago';
            return Math.floor(s / 86400) + 'd ago';
        }
    },

    toast: { show(msg, type = 'success') { const c = document.getElementById('toast-container') || this.create(); const t = document.createElement('div'); t.className = `toast toast-${type}`; t.innerHTML = `<i class="fas fa-${type === 'success' ? 'check' : type === 'warning' ? 'exclamation' : 'info'}-circle"></i> ${msg}`; c.appendChild(t); setTimeout(() => t.classList.add('show'), 10); setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3000); }, create() { const c = document.createElement('div'); c.id = 'toast-container'; c.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;'; document.body.appendChild(c); const s = document.createElement('style'); s.textContent = '.toast{display:flex;align-items:center;gap:10px;padding:12px 20px;background:#1e1e3f;border:1px solid rgba(255,255,255,0.1);border-radius:10px;color:#fff;margin-bottom:10px;transform:translateX(120%);transition:0.3s;}.toast.show{transform:translateX(0);}.toast-success{border-left:3px solid #10b981;}.toast-warning{border-left:3px solid #f59e0b;}'; document.head.appendChild(s); return c; }, warning(msg) { this.show(msg, 'warning'); } }
};
window.ShieldAPI = ShieldAPI;
