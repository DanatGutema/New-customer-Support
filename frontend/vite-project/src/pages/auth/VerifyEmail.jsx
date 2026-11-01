import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import AuthLayout from "../../components/layout/AuthLayout";
import axios from "axios";

export default function VerifyEmail() {

    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const token = searchParams.get("token");

    const [loading,setLoading] = useState(true);
    const [success,setSuccess] = useState(false);
    const [error,setError] = useState("");
    const verifiedRef = useRef(false);

    useEffect(() => {

        async function verify(){

            try{

                const apiUrl =
                    import.meta.env.VITE_API_URL || "http://localhost:5000/api";

                await axios.get(
                    `${apiUrl}/auth/verify-email?token=${token}`
                );

                setSuccess(true);
                verifiedRef.current = true;

                setTimeout(()=>{
                    navigate("/login");
                },3000);

            }
            catch(err){

                setError(
                    err.response?.data?.message ||
                    "Verification failed."
                );

            }
            finally{

                setLoading(false);

            }

        }

        if(token){
            verify();
        }
        else{
            setLoading(false);
            setError("Invalid verification link.");
        }

    },[]);

    return(

        <AuthLayout
            title="Email Verification"
            subtitle=""
        >

            {loading && (
                <div className="text-center">
                    Verifying your email...
                </div>
            )}

            {!loading && success && (
                <div className="rounded-xl bg-green-100 p-6 text-center">

                    <h2 className="text-green-700 text-xl font-bold">
                        Email verified successfully!
                    </h2>

                    <p className="mt-3">
                        Redirecting to login...
                    </p>

                </div>
            )}

            {!loading && error && (

                <div className="rounded-xl bg-red-100 p-6 text-center">

                    <h2 className="text-red-700 font-bold">
                        Verification Failed
                    </h2>

                    <p className="mt-3">
                        {error}
                    </p>

                </div>

            )}

        </AuthLayout>

    );

}
