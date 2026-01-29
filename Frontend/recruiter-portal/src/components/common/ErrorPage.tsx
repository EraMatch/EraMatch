import { useRouteError } from "react-router-dom";

export default function ErrorPage() {
    const error: any = useRouteError();
    console.error(error);

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
            <h1 className="text-4xl font-bold text-red-600 mb-4">Oops!</h1>
            <p className="text-xl text-gray-800 mb-4">Sorry, an unexpected error has occurred.</p>
            <div className="bg-white p-6 rounded-lg shadow-md max-w-2xl w-full border-l-4 border-red-500">
                <p className="text-gray-700 font-mono text-sm whitespace-pre-wrap">
                    {error.statusText || error.message || JSON.stringify(error)}
                </p>
                {error.stack && (
                    <details className="mt-4">
                        <summary className="cursor-pointer text-blue-600">Stack Trace</summary>
                        <pre className="mt-2 text-xs bg-gray-50 p-2 overflow-auto max-h-64">
                            {error.stack}
                        </pre>
                    </details>
                )}
            </div>
            <a href="/" className="mt-8 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors">
                Go Home
            </a>
        </div>
    );
}
