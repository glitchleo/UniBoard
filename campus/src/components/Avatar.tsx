import { useState } from 'react';

export function Avatar({
  value,
  name,
  className = '',
}: {
  value: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState('');
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('');
  const photo = /^https?:\/\//.test(value);
  return (
    <span className={`avatar ${className}`} aria-hidden="true">
      {photo && failed !== value ? (
        <img src={value} alt="" onError={() => setFailed(value)} />
      ) : photo ? (
        initials
      ) : (
        value || initials
      )}
    </span>
  );
}
