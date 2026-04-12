import React from 'react';
import VerifiedPhysicianInline from './VerifiedPhysicianInline';
import VerifiedFounderInline from './VerifiedFounderInline';

type AuthorLike = {
  isVerifiedPhysician?: boolean;
  isVerifiedFounder?: boolean;
};

const AuthorVerificationsInline: React.FC<{ author?: AuthorLike | null }> = ({ author }) => {
  if (!author) return null;
  return (
    <>
      {author.isVerifiedPhysician && <VerifiedPhysicianInline />}
      {author.isVerifiedFounder && <VerifiedFounderInline />}
    </>
  );
};

export default AuthorVerificationsInline;
