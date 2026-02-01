// --- Configuration & State ---
const STOCK_DATA = {
    'AAPL': { base: 150, volatility: 2.5, name: 'Apple Inc.' },
    'TSLA': { base: 240, volatility: 8.0, name: 'Tesla, Inc.' },
    'GOOGL': { base: 130, volatility: 2.0, name: 'Alphabet Inc.' },
    'AMZN': { base: 135, volatility: 2.2, name: 'Amazon.com' },
    'MSFT': { base: 330, volatility: 3.0, name: 'Microsoft Corp.' }
};

const CHART_CONFIG = {
    daysHistory: 60,
    daysPrediction: 15,
    padding: 40
};

let currentState = {
    symbol: 'AAPL',
    model: 'LSTM',
    data: [],
    prediction: []
};

// --- Utilities ---
function formatCurrency(num) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

// Number Counter Animation
function animateValue(obj, start, end, duration, isCurrency = true) {
    let startTimestamp = null;
    const step = (timestamp) => {
        if (!startTimestamp) startTimestamp = timestamp;
        const progress = Math.min((timestamp - startTimestamp) / duration, 1);
        const value = progress * (end - start) + start;
        obj.innerHTML = isCurrency ? formatCurrency(value) : value.toFixed(1) + (obj.id.includes('confidence') ? '%' : '');
        if (progress < 1) {
            window.requestAnimationFrame(step);
        }
    };
    window.requestAnimationFrame(step);
}

function showToast(message, type = 'info', isLoading = false) {
    const toast = document.getElementById('toast');
    const msgEl = document.getElementById('toastMessage');
    const iconEl = document.getElementById('toastIcon');

    msgEl.textContent = message;
    
    if(isLoading) {
        iconEl.innerHTML = '<span class="loader"></span>';
    } else {
        iconEl.innerHTML = type === 'success' ? '✅' : 'ℹ️';
    }

    toast.classList.add('show');
    if (!isLoading) {
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    return toast;
}

function selectRadio(label) {
    // Visual selection logic for custom radio styling
    document.querySelectorAll('.radio-option').forEach(el => el.classList.remove('selected'));
    label.classList.add('selected');
    label.querySelector('input').checked = true;
}

// --- Data Simulation ---
function generateStockData(symbol) {
    const config = STOCK_DATA[symbol];
    const prices = [];
    let currentPrice = config.base;
    
    for (let i = 0; i < CHART_CONFIG.daysHistory; i++) {
        // Random walk with slight drift
        const change = (Math.random() - 0.5) * config.volatility;
        currentPrice += change;
        prices.push({
            day: i,
            price: Math.max(1, currentPrice),
            type: 'history'
        });
    }
    return prices;
}

function simulatePrediction(historyData, modelType) {
    const predictions = [];
    const lastPrice = historyData[historyData.length - 1].price;
    let currentPred = lastPrice;
    const config = STOCK_DATA[currentState.symbol];

    for (let i = 1; i <= CHART_CONFIG.daysPrediction; i++) {
        let trend = 0;
        
        if (modelType === 'LSTM') {
            // Smoother trend
            trend = (Math.random() - 0.45) * (config.volatility * 0.8); 
        } else {
            // More volatile/mean reverting
            trend = (Math.random() - 0.5) * (config.volatility * 1.1);
        }

        currentPred += trend;
        predictions.push({
            day: CHART_CONFIG.daysHistory + i - 1,
            price: Math.max(1, currentPred),
            type: 'prediction'
        });
    }
    return predictions;
}

// --- Advanced Animated Charting Engine ---
class StockChart {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.wrapper = document.getElementById('chartWrapper');
        this.tooltip = document.getElementById('chartTooltip');
        
        this.resize();
        window.addEventListener('resize', () => {
            this.resize();
            if(currentState.data.length) this.draw(false); // Redraw without animation on resize
        });

        // Interaction state
        this.allPoints = [];
        this.isAnimating = false;
        
        // Mouse events
        this.canvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
        this.canvas.addEventListener('mouseleave', () => {
            this.tooltip.style.opacity = 0;
            this.draw(false); // Clear crosshair
        });
    }

    resize() {
        const rect = this.wrapper.getBoundingClientRect();
        this.canvas.width = rect.width * 2;
        this.canvas.height = rect.height * 2;
        this.ctx.scale(2, 2);
        this.width = rect.width;
        this.height = rect.height;
    }

    handleMouseMove(e) {
        if (this.isAnimating || this.allPoints.length === 0) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        
        // Find nearest point
        const padding = CHART_CONFIG.padding;
        const chartWidth = this.width - padding * 2;
        const step = chartWidth / (this.allPoints.length - 1);
        
        let index = Math.round((mouseX - padding) / step);
        index = Math.max(0, Math.min(index, this.allPoints.length - 1));
        
        const point = this.allPoints[index];

        // Redraw chart with crosshair
        this.draw(false, index);

        // Update Tooltip
        this.tooltip.style.opacity = 1;
        this.tooltip.style.left = (padding + index * step) + 'px';
        this.tooltip.style.top = (point.y - 10) + 'px';
        
        const typeLabel = point.data.type === 'history' ? 'Historical' : currentState.model + ' Forecast';
        this.tooltip.innerHTML = `<strong>Day ${point.data.day + 1}</strong><br>${typeLabel}<br>$${point.data.price.toFixed(2)}`;
    }

    draw(animate = true, highlightIndex = -1) {
        const ctx = this.ctx;
        const padding = CHART_CONFIG.padding;
        
        // 1. Setup Data Coordinates
        const allData = [...currentState.data, ...currentState.prediction];
        const prices = allData.map(d => d.price);
        const minPrice = Math.min(...prices) * 0.99;
        const maxPrice = Math.max(...prices) * 1.01;
        const range = maxPrice - minPrice;

        const getX = (index) => padding + (index / (allData.length - 1)) * (this.width - padding * 2);
        const getY = (price) => this.height - padding - ((price - minPrice) / range) * (this.height - padding * 2);

        // Save points for interaction
        this.allPoints = allData.map((d, i) => ({ x: getX(i), y: getY(d.price), data: d }));

        // 2. Clear
        ctx.clearRect(0, 0, this.width, this.height);

        // 3. Draw Grid & Axes
        ctx.beginPath();
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 4; i++) {
            const y = padding + (i / 4) * (this.height - padding * 2);
            ctx.moveTo(padding, y);
            ctx.lineTo(this.width - padding, y);
            
            ctx.fillStyle = '#94a3b8';
            ctx.font = '10px sans-serif';
            ctx.fillText((maxPrice - (i/4) * range).toFixed(0), 5, y + 3);
        }
        ctx.stroke();

        // 4. Animate or Draw Lines
        if (animate) {
            this.isAnimating = true;
            let progress = 0;
            const animateLoop = () => {
                progress += 0.03; // Animation speed
                if (progress > 1) progress = 1;

                // Clear and redraw grid every frame
                ctx.clearRect(0, 0, this.width, this.height);
                // Re-drawing grid quickly:
                ctx.beginPath(); ctx.strokeStyle = '#f1f5f9'; ctx.lineWidth = 1;
                for (let i = 0; i <= 4; i++) {
                    const y = padding + (i / 4) * (this.height - padding * 2);
                    ctx.moveTo(padding, y); ctx.lineTo(this.width - padding, y);
                } ctx.stroke();

                // Draw History
                this.drawPath(currentState.data, getX, getY, '#4f46e5', 3, false, progress);
                
                // Draw Prediction (starts after history finishes visual)
                if (progress > 0.5) {
                    let predProgress = (progress - 0.5) * 2;
                    this.drawPath(currentState.prediction, getX, getY, '#10b981', 3, true, predProgress);
                }

                // Draw Divider
                const dividerX = getX(currentState.data.length - 1);
                ctx.beginPath();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#cbd5e1';
                ctx.lineWidth = 2;
                ctx.moveTo(dividerX, padding);
                ctx.lineTo(dividerX, this.height - padding);
                ctx.stroke();
                ctx.setLineDash([]);

                if (progress < 1) {
                    requestAnimationFrame(animateLoop);
                } else {
                    this.isAnimating = false;
                }
            };
            animateLoop();
        } else {
            // Static Draw
            this.drawPath(currentState.data, getX, getY, '#4f46e5', 3, false, 1);
            this.drawPath(currentState.prediction, getX, getY, '#10b981', 3, true, 1);

            // Divider
            const dividerX = getX(currentState.data.length - 1);
            ctx.beginPath();
            ctx.setLineDash([5, 5]);
            ctx.strokeStyle = '#cbd5e1';
            ctx.lineWidth = 2;
            ctx.moveTo(dividerX, padding);
            ctx.lineTo(dividerX, this.height - padding);
            ctx.stroke();
            ctx.setLineDash([]);

            // Highlight Point if interacting
            if (highlightIndex >= 0) {
                const p = this.allPoints[highlightIndex];
                ctx.beginPath();
                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2;
                ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();

                // Draw vertical line
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(15, 23, 42, 0.3)';
                ctx.lineWidth = 1;
                ctx.moveTo(p.x, padding);
                ctx.lineTo(p.x, this.height - padding);
                ctx.stroke();
            }
        }

        // Draw Legend (Static)
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(padding + 10, padding, 10, 10);
        ctx.fillStyle = '#1e293b';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText("Historical Data", padding + 25, padding + 9);

        ctx.fillStyle = '#10b981';
        ctx.fillRect(padding + 130, padding, 10, 10);
        ctx.fillText(`${currentState.model} Forecast`, padding + 145, padding + 9);
    }

    drawPath(data, getX, getY, color, width, isDashed, progress) {
        const ctx = this.ctx;
        const offset = isDashed ? currentState.data.length : 0;
        const totalPoints = data.length;
        
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        if (isDashed) ctx.setLineDash([6, 4]);
        else ctx.setLineDash([]);

        // Determine how much of the line to draw based on progress
        const maxIndex = Math.floor(totalPoints * progress);
        
        for (let i = 0; i < totalPoints; i++) {
            if (i > maxIndex) break;

            const globalIndex = offset + i;
            const x = getX(globalIndex);
            const y = getY(data[i].price);

            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

// --- Background Animation (Neural Network) ---
class NeuralBackground {
    constructor() {
        this.canvas = document.getElementById('bgCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        
        window.addEventListener('resize', () => this.resize());
        
        // Create particles
        for(let i=0; i<60; i++) {
            this.particles.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1
            });
        }
        this.animate();
    }

    resize() {
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
    }

    animate() {
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.fillStyle = 'rgba(79, 70, 229, 0.5)';
        this.ctx.strokeStyle = 'rgba(79, 70, 229, 0.15)';

        for(let i=0; i<this.particles.length; i++) {
            let p = this.particles[i];
            
            // Move
            p.x += p.vx;
            p.y += p.vy;

            // Bounce
            if(p.x < 0 || p.x > this.width) p.vx *= -1;
            if(p.y < 0 || p.y > this.height) p.vy *= -1;

            // Draw Dot
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            this.ctx.fill();

            // Connect
            for(let j=i+1; j<this.particles.length; j++) {
                let p2 = this.particles[j];
                let dx = p.x - p2.x;
                let dy = p.y - p2.y;
                let dist = Math.sqrt(dx*dx + dy*dy);

                if(dist < 150) {
                    this.ctx.beginPath();
                    this.ctx.lineWidth = 1 - (dist/150);
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
        requestAnimationFrame(this.animate.bind(this));
    }
}

// --- Main Logic Controller ---
const chartEngine = new StockChart('stockChart');
new NeuralBackground(); // Start background

// Scroll Observer
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

function runAnalysis() {
    const btn = document.getElementById('analyzeBtn');
    const originalText = btn.innerHTML;
    const symbol = document.getElementById('stockSelect').value;
    const model = document.querySelector('input[name="model"]:checked').value;

    currentState.symbol = symbol;
    currentState.model = model;
    
    // UI Loading State
    btn.disabled = true;
    btn.innerHTML = `<span class="loader"></span> Processing...`;
    showToast(`Running ${model} model for ${symbol}...`, 'info', true);

    // Simulate Delay
    setTimeout(() => {
        const history = generateStockData(symbol);
        const prediction = simulatePrediction(history, model);
        currentState.data = history;
        currentState.prediction = prediction;

        const current = history[history.length - 1].price;
        const nextDay = prediction[0].price;
        const predictedEnd = prediction[prediction.length - 1].price;
        const isUp = nextDay >= current;
        const percentChange = ((nextDay - current) / current) * 100;
        const confidence = model === 'LSTM' ? (85 + Math.random() * 10) : (78 + Math.random() * 12);

        // Update Stats with Count Animation
        const currEl = document.getElementById('currentPrice');
        const predEl = document.getElementById('predictedPrice');
        const confEl = document.getElementById('confidenceScore');
        
        // Parse previous values to animate from there (or from 0)
        const prevCurr = parseFloat(currEl.innerHTML.replace(/[^0-9.-]+/g,"")) || 0;
        
        animateValue(currEl, prevCurr, current, 1000);
        animateValue(predEl, current, nextDay, 1000); // Animate from current to next
        animateValue(confEl, 0, confidence, 1500, false);

        const trendEl = document.getElementById('trendIndicator');
        trendEl.textContent = `${isUp ? '▲' : '▼'} ${Math.abs(percentChange).toFixed(2)}%`;
        trendEl.className = `trend ${isUp ? 'up' : 'down'}`;

        // Render Chart with Animation
        chartEngine.draw(true);

        // Reset UI
        btn.disabled = false;
        btn.innerHTML = originalText;
        showToast('Analysis Complete', 'success');

    }, 1500);
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    runAnalysis();
});