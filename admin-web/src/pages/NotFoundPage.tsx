import { Link } from 'react-router-dom';
import { Gamepad2 } from 'lucide-react';
import { Button } from '../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-navy-50 px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-900 text-white">
        <Gamepad2 className="h-7 w-7" />
      </div>
      <div>
        <p className="text-5xl font-bold text-navy-900">404</p>
        <p className="mt-2 text-sm text-navy-500">This page does not exist or has been moved.</p>
      </div>
      <Link to="/">
        <Button variant="primary">Back to dashboard</Button>
      </Link>
    </div>
  );
}
