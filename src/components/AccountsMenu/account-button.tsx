import { Amount } from "@/components/ui/amount";

type AccountButtonProps = {
  name: string;
  balance: number;
  activeAccount?: string;
  onClick: () => void;
};

const AccountButton = ({
  name,
  balance,
  activeAccount,
  onClick,
}: AccountButtonProps) => {
  const isActive = activeAccount === name;

  return (
    <button
      aria-label={`${name} account`}
      onClick={onClick}
      className={`flex flex-row items-center justify-between w-full rounded-md px-2 py-1.5 text-sm transition-colors ${
        isActive
          ? "bg-sidebar-accent text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      }`}
    >
      <span>{name}</span>
      <Amount value={balance} />
    </button>
  );
};

export default AccountButton;
