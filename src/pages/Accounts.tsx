import Layout from "@/components/layout";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Accounts() {
  return (
    <Layout>
      <section className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 lg:p-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
            <div>
              <h1 className="text-slate-900 dark:text-white text-3xl font-black tracking-tight mb-2">
                Transactions
              </h1>
              <p className="text-slate-500 text-sm">
                Review your spending and income across all accounts.
              </p>
            </div>
            {/* Filter button group */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
              <button className="px-4 py-1.5 text-xs font-bold bg-primary text-white rounded-md">
                All
              </button>
              <button className="px-4 py-1.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-all">
                Income
              </button>
              <button className="px-4 py-1.5 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 rounded-md transition-all">
                Expenses
              </button>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">
                      Vendor
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-right">
                      Amount
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
                    <td className="px-6 py-5 text-sm">Oct 24, 2023</td>
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                          Whole Foods
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-full">
                        Groceries
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-right text-slate-900 dark:text-white">
                      -$124.50
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
                    <td className="px-6 py-5 text-sm">Oct 23, 2023</td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Tech Corp
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-full">
                        Salary
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-right text-emerald-600">
                      +$5,000.00
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
                    <td className="px-6 py-5 text-sm">Oct 22, 2023</td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Starbucks
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-full">
                        Dining
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-right text-slate-900 dark:text-white">
                      -$6.75
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
                    <td className="px-6 py-5 text-sm">Oct 21, 2023</td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Landlord Inc
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-full">
                        Rent
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-right text-slate-900 dark:text-white">
                      -$1,800.00
                    </td>
                  </tr>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all group">
                    <td className="px-6 py-5 text-sm">Oct 20, 2023</td>
                    <td className="px-6 py-5">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        Amazon
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs font-bold rounded-full">
                        Shopping
                      </span>
                    </td>
                    <td className="px-6 py-5 text-sm font-bold text-right text-slate-900 dark:text-white">
                      -$45.32
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/30 flex justify-between items-center">
              <span className="text-xs font-medium">
                Showing 6 of 142 transactions
              </span>
              <div className="flex gap-2">
                <button className="size-8 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:text-primary transition-all">
                  <ChevronLeft size={16} />
                </button>
                <button className="size-8 flex items-center justify-center rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:text-primary transition-all">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </Layout>
  );
}
