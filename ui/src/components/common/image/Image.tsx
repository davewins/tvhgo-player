import React, { ReactNode, useState } from 'react';

type Props = React.DetailedHTMLProps<
  React.ImgHTMLAttributes<HTMLImageElement>,
  HTMLImageElement
> & {
  // Shown instead of the image if it cannot be loaded (e.g. a channel without a logo).
  fallback?: ReactNode;
};

function Image({ fallback, ...props }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  if (failed && fallback) {
    return <div className={props.className}>{fallback}</div>;
  }

  return (
    <div className={props.className}>
      {!loaded && <div style={{ width: '100%', height: '100%' }}></div>}
      <img
        {...props}
        onLoad={() => {
          setLoaded(true);
        }}
        onError={() => setFailed(true)}
        style={loaded ? props.style : { display: 'none' }}
      />
    </div>
  );
}

export default Image;
