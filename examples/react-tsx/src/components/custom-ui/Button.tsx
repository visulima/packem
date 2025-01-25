import { ReactFC } from "../../types";

export const Button: ReactFC<{}> = ({ children }) => {
  return (
    <button className="bg-yellow-500 text-white p-2 rounded-md">
      {children}
    </button>
  );
};
