import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config({ path: './config/.env' });

if(!process.env.GMAIL_USER || !process.env.GMAIL_PASS){
    console.error("GMAIL_USER and GMAIL_PASS must be defined in .env file");
}

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS,
    },
})

console.log("GMAIL_USER:", process.env.GMAIL_USER);
console.log("GMAIL_PASS:", process.env.GMAIL_PASS? '******' : 'Not Set');
console.log("Nodemailer Transporter:", transporter);


export const sendEmail = async (email : string, otp: number) => { 
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: "Your OTP Code",
        text: `Your OTP code is ${otp}`,
    };

    console.log(`Sending email to ${email} with OTP ${otp}`);
    console.log("Mail Options:", mailOptions);

    return transporter.sendMail(mailOptions,(error : Error | null, info : any) => {
        if (error) {
            console.error("Error sending email: ", error);
        } else {
            console.log("Email sent: " + info.response);
        }
    });    
}