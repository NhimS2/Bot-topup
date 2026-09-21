document.addEventListener('DOMContentLoaded', () => {
    // Navbar scroll effect
    const navbar = document.querySelector('.navbar');
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    });

    // Mobile menu toggle
    const mobileBtn = document.querySelector('.mobile-menu-btn');
    mobileBtn.addEventListener('click', () => {
        alert('Menu di động sẽ được hiển thị ở đây!');
    });

    // Mouse tracking for glowing cards (Tech effect)
    const cards = document.querySelectorAll('.product-card');
    
    document.querySelector('.products').addEventListener('mousemove', (e) => {
        for(const card of cards) {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            
            card.style.setProperty('--mouse-x', `${x}px`);
            card.style.setProperty('--mouse-y', `${y}px`);
        }
    });

    // Interactive Hero Image Mouse movement
    const heroSection = document.querySelector('.hero');
    const glassMockup = document.querySelector('.glass-mockup');
    
    if (heroSection && glassMockup) {
        heroSection.addEventListener('mousemove', (e) => {
            const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
            const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
            glassMockup.style.transform = `rotateY(${xAxis}deg) rotateX(${yAxis}deg)`;
        });
        
        heroSection.addEventListener('mouseleave', () => {
            glassMockup.style.transform = `rotateY(-15deg) rotateX(10deg)`;
        });
    }

    // Scroll Animation Observer
    const observerOptions = {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px"
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = "1";
                entry.target.style.transform = "translateY(0)";
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    // Apply observer to elements
    document.querySelectorAll('.product-card, .section-header, .trusted-by').forEach((el) => {
        el.style.opacity = "0";
        el.style.transform = "translateY(40px)";
        el.style.transition = "all 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)";
        observer.observe(el);
    });
});
