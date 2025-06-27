// // Wait for DOM to be fully loaded
// document.addEventListener("DOMContentLoaded", function () {

//     // Initialize EmailJS
//     emailjs.init("bJosCOZyzldOZC6UP");

//     // Form submission handler
//     document.getElementById('contactForm').addEventListener('submit', function (e) {
//         e.preventDefault();

//         // Collect form data
//         const params = {
//             name: document.getElementById("name").value,
//             surname: document.getElementById("surname").value,
//             city: document.getElementById("city").value,
//             address: document.getElementById("address").value,
//             phone: document.getElementById("phone").value,
//             message: document.getElementById("message").value
//         };

//         // Send email
//         emailjs.send("service_9tggop8", "template_nf17cbd", params)
//             .then(function (response) {
//                 console.log("SUCCESS!", response.status, response.text);
//                 document.getElementById("successMessage").style.display = "block";
//                 document.getElementById('contactForm').reset();
//                 setTimeout(() => {
//                     document.getElementById("successMessage").style.display = "none";
//                 }, 5000);
//             }, function (error) {
//                 console.log("FAILED...", error);
//                 alert("Failed to send message.");
//             });
//     });

//     // Smooth scrolling for nav links
//     document.querySelectorAll('a[href^="#"]').forEach(anchor => {
//         anchor.addEventListener('click', function (e) {
//             e.preventDefault();
//             const target = document.querySelector(this.getAttribute('href'));
//             if (target) {
//                 target.scrollIntoView({
//                     behavior: 'smooth',
//                     block: 'start'
//                 });
//             }
//         });
//     });

//     // Active link highlight on scroll
//     window.addEventListener('scroll', () => {
//         const sections = document.querySelectorAll('section');
//         const navLinks = document.querySelectorAll('nav ul li a');
//         let current = '';

//         sections.forEach(section => {
//             const sectionTop = section.offsetTop;
//             if (scrollY >= sectionTop - 200) {
//                 current = section.getAttribute('id');
//             }
//         });

//         navLinks.forEach(link => {
//             link.classList.remove('active');
//             if (link.getAttribute('href') === '#' + current) {
//                 link.classList.add('active');
//             }
//         });
//     });

// });
 


        const hero = document.querySelector('.hero');

        const backgrounds = [
            'url("domasna_apteka/back_photo_index.jpg")',
            'url("domasna_apteka/daci_jak.jpg")',
            'url("domasna_apteka/oreovka_headline.jpg")'
        ];

        let index = 0;

        setInterval(() => {
            index = (index + 1) % backgrounds.length;
            hero.style.backgroundImage = backgrounds[index];
        }, 5000); // every 5 seconds







        // Initialize EmailJS
        (function () {
            emailjs.init({
                publicKey: "bJosCOZyzldOZC6UP", // Replace with your actual public key
            });
        })();

        // Form submission function
        function sendMail() {
            const form = document.getElementById('contactForm');
            const submitBtn = document.getElementById('submitBtn');
            const successMessage = document.getElementById('successMessage');
            const errorMessage = document.getElementById('errorMessage');

            // Get form data
            const templateParams = {
                from_name: document.getElementById('name').value,
                from_surname: document.getElementById('surname').value,
                from_city: document.getElementById('city').value,
                from_address: document.getElementById('address').value,
                from_phone: document.getElementById('phone').value,
                message: document.getElementById('message').value,
                to_email: 'aptekadomasna@yahoo.com'
            };

            // Show loading state
            submitBtn.innerHTML = 'Се испраќа...';
            submitBtn.disabled = true;
            form.classList.add('loading');

            // Hide previous messages
            successMessage.classList.remove('show');
            errorMessage.classList.remove('show');

            // Send email using EmailJS
            emailjs.send(
                'service_9tggop8', // Replace with your EmailJS service ID
                'template_4mrx4wu', // Replace with your EmailJS template ID
                templateParams
            ).then(function (response) {
                console.log('SUCCESS!', response.status, response.text);

                // Show success message
                successMessage.classList.add('show');
                form.reset();

                // Reset button
                submitBtn.innerHTML = 'Направи Нарачка';
                submitBtn.disabled = false;
                form.classList.remove('loading');

            }, function (error) {
                console.log('FAILED...', error);

                // Show error message
                errorMessage.classList.add('show');

                // Reset button
                submitBtn.innerHTML = 'Направи Нарачка';
                submitBtn.disabled = false;
                form.classList.remove('loading');
            });
        }

        // Form submit event listener
        document.getElementById('contactForm').addEventListener('submit', function (e) {
            e.preventDefault();
            sendMail();
        });

        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
    