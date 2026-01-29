import svgPaths from "./svg-dnuhrjuvc";
import imgImageEramatch from "../assets/image-eramatch.png";

function ImageEramatch() {
  return (
    <div className="h-[40px] relative shrink-0 w-[201.188px]" data-name="Image (ERAMATCH)">
      <img alt="" className="absolute bg-clip-padding border-0 border-[transparent] border-solid inset-0 max-w-none object-50%-50% object-cover pointer-events-none size-full" src={imgImageEramatch} />
    </div>
  );
}

function Icon() {
  return (
    <div className="absolute left-0 size-[20px] top-0" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g id="Icon">
          <path d={svgPaths.p1c3efea0} id="Vector" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
          <path d={svgPaths.p25877f40} id="Vector_2" stroke="var(--stroke-0, #18BA84)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text() {
  return (
    <div className="absolute bg-[#ef4444] content-stretch flex items-center justify-center left-[8px] rounded-[3.35544e+07px] size-[16px] top-[-4px]" data-name="Text">
      <p className="font-['Arimo:Regular',sans-serif] font-normal leading-[15px] relative shrink-0 text-[10px] text-center text-nowrap text-white">3</p>
    </div>
  );
}

function Notifications() {
  return (
    <div className="absolute left-[8px] size-[20px] top-[8px]" data-name="Notifications">
      <Icon />
      <Text />
    </div>
  );
}

function Container() {
  return (
    <div className="relative rounded-[10px] shrink-0 size-[36px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Notifications />
      </div>
    </div>
  );
}

function Button() {
  return (
    <div className="basis-0 grow h-[42px] min-h-px min-w-px relative rounded-[3.35544e+07px] shrink-0" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[#c63434] border-solid inset-0 pointer-events-none rounded-[3.35544e+07px]" />
      <div className="flex flex-row items-center justify-center size-full">
        <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center px-[25px] py-px relative size-full">
          <p className="font-['Arimo:Regular',sans-serif] font-normal leading-[24px] relative shrink-0 text-[#c63434] text-[16px] text-center text-nowrap">Sign out</p>
        </div>
      </div>
    </div>
  );
}

function Container1() {
  return (
    <div className="h-[42px] relative shrink-0 w-[160.719px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[16px] items-center relative size-full">
        <Container />
        <Button />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div className="bg-[#edf0f8] h-[90px] relative shrink-0 w-full" data-name="Header">
      <div className="flex flex-row items-center size-full">
        <div className="content-stretch flex items-center justify-between px-[32px] py-0 relative size-full">
          <ImageEramatch />
          <Container1 />
        </div>
      </div>
    </div>
  );
}

function Icon1() {
  return (
    <div className="relative shrink-0 size-[20px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 20 20">
        <g id="Icon">
          <path d="M12.5 15L7.5 10L12.5 5" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text1() {
  return (
    <div className="basis-0 grow h-[21px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6b7280] text-[14px] text-center text-nowrap top-0 translate-x-[-50%]">Back</p>
      </div>
    </div>
  );
}

function Button1() {
  return (
    <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-[48px] top-[24px] w-[59.125px]" data-name="Button">
      <Icon1 />
      <Text1 />
    </div>
  );
}

function Container2() {
  return (
    <div className="bg-gradient-to-b from-[#6366f1] relative rounded-[16px] shrink-0 size-[100px] to-[#8b5cf6]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex items-center justify-center relative size-full">
        <p className="font-['Arimo:Regular',sans-serif] font-normal leading-[54px] relative shrink-0 text-[36px] text-nowrap text-white">JS</p>
      </div>
    </div>
  );
}

function Heading() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Heading 1">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-[-2px]">John Smith</p>
    </div>
  );
}

function Paragraph() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#6b7280] text-[16px] text-nowrap top-0">Senior Full Stack Developer</p>
    </div>
  );
}

function Icon2() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p2f8e7e80} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p17070980} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Text2() {
  return (
    <div className="basis-0 grow h-[21px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] text-nowrap top-0">john.smith@email.com</p>
      </div>
    </div>
  );
}

function Container3() {
  return (
    <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-0 top-0 w-[165.813px]" data-name="Container">
      <Icon2 />
      <Text2 />
    </div>
  );
}

function Icon3() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_4027_565)" id="Icon">
          <path d={svgPaths.p26187580} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_4027_565">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Text3() {
  return (
    <div className="basis-0 grow h-[21px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] text-nowrap top-0">+1 (555) 123-4567</p>
      </div>
    </div>
  );
}

function Container4() {
  return (
    <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-[181.81px] top-0 w-[139.594px]" data-name="Container">
      <Icon3 />
      <Text3 />
    </div>
  );
}

function Icon4() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p14548f00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p17781bc0} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Text4() {
  return (
    <div className="basis-0 grow h-[21px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] text-nowrap top-0">San Francisco, CA</p>
      </div>
    </div>
  );
}

function Container5() {
  return (
    <div className="absolute content-stretch flex gap-[8px] h-[21px] items-center left-[337.41px] top-0 w-[140.719px]" data-name="Container">
      <Icon4 />
      <Text4 />
    </div>
  );
}

function Container6() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Container">
      <Container3 />
      <Container4 />
      <Container5 />
    </div>
  );
}

function Container7() {
  return (
    <div className="h-[85px] relative shrink-0 w-[478.125px]" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[4px] items-start relative size-full">
        <Heading />
        <Paragraph />
        <Container6 />
      </div>
    </div>
  );
}

function Icon5() {
  return (
    <div className="relative shrink-0 size-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d="M8 10V2" id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p23ad1400} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p19411800} id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Text5() {
  return (
    <div className="basis-0 grow h-[21px] min-h-px min-w-px relative shrink-0" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[59.5px] text-[#374151] text-[14px] text-center text-nowrap top-0 translate-x-[-50%]">Download Resume</p>
      </div>
    </div>
  );
}

function Button2() {
  return (
    <div className="h-[40px] relative rounded-[8px] shrink-0 w-[184.297px]" data-name="Button">
      <div aria-hidden="true" className="absolute border border-[#e5e7eb] border-solid inset-0 pointer-events-none rounded-[8px]" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex gap-[8px] items-center px-[21px] py-px relative size-full">
        <Icon5 />
        <Text5 />
      </div>
    </div>
  );
}

function Container8() {
  return (
    <div className="content-stretch flex h-[85px] items-start justify-between relative shrink-0 w-full" data-name="Container">
      <Container7 />
      <Button2 />
    </div>
  );
}

function Container9() {
  return (
    <div className="h-[18px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[18px] left-0 text-[#6b7280] text-[12px] text-nowrap top-0">Overall Score</p>
    </div>
  );
}

function Container10() {
  return (
    <div className="h-[36px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[36px] left-0 text-[#111827] text-[24px] text-nowrap top-[-2px]">95</p>
    </div>
  );
}

function Container11() {
  return (
    <div className="[grid-area:1_/_1] bg-[#f9fafb] place-self-stretch relative rounded-[8px] shrink-0" data-name="Container">
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start pb-0 pt-[16px] px-[16px] relative size-full">
          <Container9 />
          <Container10 />
        </div>
      </div>
    </div>
  );
}

function Container12() {
  return (
    <div className="h-[18px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[18px] left-0 text-[#6b7280] text-[12px] text-nowrap top-0">Assessment</p>
    </div>
  );
}

function Container13() {
  return (
    <div className="h-[36px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[36px] left-0 text-[#111827] text-[24px] text-nowrap top-[-2px]">95</p>
    </div>
  );
}

function Container14() {
  return (
    <div className="[grid-area:1_/_2] bg-[#f9fafb] place-self-stretch relative rounded-[8px] shrink-0" data-name="Container">
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start pb-0 pt-[16px] px-[16px] relative size-full">
          <Container12 />
          <Container13 />
        </div>
      </div>
    </div>
  );
}

function Container15() {
  return (
    <div className="h-[18px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[18px] left-0 text-[#6b7280] text-[12px] text-nowrap top-0">AI Interview</p>
    </div>
  );
}

function Container16() {
  return (
    <div className="h-[36px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[36px] left-0 text-[#111827] text-[24px] text-nowrap top-[-2px]">92</p>
    </div>
  );
}

function Container17() {
  return (
    <div className="[grid-area:1_/_3] bg-[#f9fafb] place-self-stretch relative rounded-[8px] shrink-0" data-name="Container">
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start pb-0 pt-[16px] px-[16px] relative size-full">
          <Container15 />
          <Container16 />
        </div>
      </div>
    </div>
  );
}

function Container18() {
  return (
    <div className="h-[18px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[18px] left-0 text-[#6b7280] text-[12px] text-nowrap top-0">GitHub</p>
    </div>
  );
}

function Container19() {
  return (
    <div className="h-[36px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[36px] left-0 text-[#111827] text-[24px] text-nowrap top-[-2px]">88</p>
    </div>
  );
}

function Container20() {
  return (
    <div className="[grid-area:1_/_4] bg-[#f9fafb] place-self-stretch relative rounded-[8px] shrink-0" data-name="Container">
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start pb-0 pt-[16px] px-[16px] relative size-full">
          <Container18 />
          <Container19 />
        </div>
      </div>
    </div>
  );
}

function Container21() {
  return (
    <div className="gap-[16px] grid grid-cols-[repeat(4,_minmax(0px,_1fr))] grid-rows-[repeat(1,_minmax(0px,_1fr))] h-[90px] relative shrink-0 w-full" data-name="Container">
      <Container11 />
      <Container14 />
      <Container17 />
      <Container20 />
    </div>
  );
}

function Container22() {
  return (
    <div className="basis-0 grow h-[191px] min-h-px min-w-px relative shrink-0" data-name="Container">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid content-stretch flex flex-col gap-[16px] items-start relative size-full">
        <Container8 />
        <Container21 />
      </div>
    </div>
  );
}

function Container23() {
  return (
    <div className="content-stretch flex gap-[24px] h-[191px] items-start relative shrink-0 w-full" data-name="Container">
      <Container2 />
      <Container22 />
    </div>
  );
}

function Container24() {
  return (
    <div className="absolute bg-white content-stretch flex flex-col h-[257px] items-start left-[48px] pb-px pt-[33px] px-[33px] rounded-[12px] top-[69px] w-[1304px]" data-name="Container">
      <div aria-hidden="true" className="absolute border border-[#e5e7eb] border-solid inset-0 pointer-events-none rounded-[12px]" />
      <Container23 />
    </div>
  );
}

function Icon6() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p28b0a6c0} id="Vector" stroke="var(--stroke-0, #6366F1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p2f10900} id="Vector_2" stroke="var(--stroke-0, #6366F1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M6.66667 6H5.33333" id="Vector_3" stroke="var(--stroke-0, #6366F1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M10.6667 8.66667H5.33333" id="Vector_4" stroke="var(--stroke-0, #6366F1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M10.6667 11.3333H5.33333" id="Vector_5" stroke="var(--stroke-0, #6366F1)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button3() {
  return (
    <div className="h-[51px] relative shrink-0 w-[122.359px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[#6366f1] border-[0px_0px_2px] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon6 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[73.5px] text-[#6366f1] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">Overview</p>
      </div>
    </div>
  );
}

function Icon7() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p28b0a6c0} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p2f10900} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M6.66667 6H5.33333" id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M10.6667 8.66667H5.33333" id="Vector_4" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M10.6667 11.3333H5.33333" id="Vector_5" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button4() {
  return (
    <div className="h-[51px] relative shrink-0 w-[116.141px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon7 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[70.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">Resume</p>
      </div>
    </div>
  );
}

function Icon8() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.pe485a00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p28ae6680} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button5() {
  return (
    <div className="h-[51px] relative shrink-0 w-[107.578px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon8 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[66px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">GitHub</p>
      </div>
    </div>
  );
}

function Icon9() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p14dc0c00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M4 6H1.33333V14H4V6Z" id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p342eb800} id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button6() {
  return (
    <div className="h-[51px] relative shrink-0 w-[116.938px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon9 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[70.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">LinkedIn</p>
      </div>
    </div>
  );
}

function Icon10() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p90824c0} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M12 11.3333V6" id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M8.66667 11.3333V3.33333" id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M5.33333 11.3333V9.33333" id="Vector_4" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button7() {
  return (
    <div className="h-[51px] relative shrink-0 w-[140.25px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon10 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[82.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">Assessment</p>
      </div>
    </div>
  );
}

function Icon11() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p144f51c0} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1e94b080} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button8() {
  return (
    <div className="h-[51px] relative shrink-0 w-[137.141px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon11 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[81px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">AI Interview</p>
      </div>
    </div>
  );
}

function Icon12() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g id="Icon">
          <path d={svgPaths.p3dcf1000} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
      </svg>
    </div>
  );
}

function Button9() {
  return (
    <div className="h-[51px] relative shrink-0 w-[100.578px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon12 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[62.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">Notes</p>
      </div>
    </div>
  );
}

function Icon13() {
  return (
    <div className="absolute left-[20px] size-[16px] top-[16.5px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 16 16">
        <g clipPath="url(#clip0_4027_592)" id="Icon">
          <path d={svgPaths.p2f327a00} id="Vector" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p1cd74100} id="Vector_2" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.pe9cb400} id="Vector_3" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d={svgPaths.p345da6c0} id="Vector_4" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
          <path d="M8 8V5.33333" id="Vector_5" stroke="var(--stroke-0, #6B7280)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.33333" />
        </g>
        <defs>
          <clipPath id="clip0_4027_592">
            <rect fill="white" height="16" width="16" />
          </clipPath>
        </defs>
      </svg>
    </div>
  );
}

function Button10() {
  return (
    <div className="h-[51px] relative shrink-0 w-[176.078px]" data-name="Button">
      <div aria-hidden="true" className="absolute border-[0px_0px_2px] border-[rgba(0,0,0,0)] border-solid inset-0 pointer-events-none" />
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <Icon13 />
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[100.5px] text-[#6b7280] text-[14px] text-center text-nowrap top-[14px] translate-x-[-50%]">Knowledge Graph</p>
      </div>
    </div>
  );
}

function Container25() {
  return (
    <div className="content-stretch flex gap-[4px] h-[51px] items-start overflow-clip relative shrink-0 w-full" data-name="Container">
      <Button3 />
      <Button4 />
      <Button5 />
      <Button6 />
      <Button7 />
      <Button8 />
      <Button9 />
      <Button10 />
    </div>
  );
}

function Container26() {
  return (
    <div className="absolute content-stretch flex flex-col h-[52px] items-start left-0 pb-px pt-0 px-[24px] top-0 w-[1302px]" data-name="Container">
      <div aria-hidden="true" className="absolute border-[#e5e7eb] border-[0px_0px_1px] border-solid inset-0 pointer-events-none" />
      <Container25 />
    </div>
  );
}

function Heading1() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-[-2px]">Skills</p>
    </div>
  );
}

function Text6() {
  return (
    <div className="absolute bg-[#ede9fe] h-[37px] left-0 rounded-[8px] top-0 w-[68.578px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6366f1] text-[14px] text-nowrap top-[8px]">React</p>
    </div>
  );
}

function Text7() {
  return (
    <div className="absolute bg-[#ede9fe] h-[37px] left-[76.58px] rounded-[8px] top-0 w-[98.141px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6366f1] text-[14px] text-nowrap top-[8px]">TypeScript</p>
    </div>
  );
}

function Text8() {
  return (
    <div className="absolute bg-[#ede9fe] h-[37px] left-[182.72px] rounded-[8px] top-0 w-[79.469px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6366f1] text-[14px] text-nowrap top-[8px]">Node.js</p>
    </div>
  );
}

function Text9() {
  return (
    <div className="absolute bg-[#ede9fe] h-[37px] left-[270.19px] rounded-[8px] top-0 w-[63.375px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6366f1] text-[14px] text-nowrap top-[8px]">AWS</p>
    </div>
  );
}

function Text10() {
  return (
    <div className="absolute bg-[#ede9fe] h-[37px] left-[341.56px] rounded-[8px] top-0 w-[76.359px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6366f1] text-[14px] text-nowrap top-[8px]">Docker</p>
    </div>
  );
}

function Text11() {
  return (
    <div className="absolute bg-[#ede9fe] h-[37px] left-[425.92px] rounded-[8px] top-0 w-[108.266px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-[16px] text-[#6366f1] text-[14px] text-nowrap top-[8px]">PostgreSQL</p>
    </div>
  );
}

function Container27() {
  return (
    <div className="h-[37px] relative shrink-0 w-full" data-name="Container">
      <Text6 />
      <Text7 />
      <Text8 />
      <Text9 />
      <Text10 />
      <Text11 />
    </div>
  );
}

function Container28() {
  return (
    <div className="content-stretch flex flex-col gap-[16px] h-[77px] items-start relative shrink-0 w-full" data-name="Container">
      <Heading1 />
      <Container27 />
    </div>
  );
}

function Heading2() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-[-2px]">Work Experience</p>
    </div>
  );
}

function Container29() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-0">Senior Software Engineer</p>
    </div>
  );
}

function Container30() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] top-0 w-[169px]">Tech Corp • 2020 - Present</p>
    </div>
  );
}

function Paragraph1() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#374151] text-[14px] text-nowrap top-0">Led development of microservices architecture serving 10M+ users</p>
    </div>
  );
}

function Container31() {
  return (
    <div className="h-[78px] relative shrink-0 w-full" data-name="Container">
      <div aria-hidden="true" className="absolute border-[#6366f1] border-[0px_0px_0px_2px] border-solid inset-0 pointer-events-none" />
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start pl-[18px] pr-0 py-0 relative size-full">
          <Container29 />
          <Container30 />
          <Paragraph1 />
        </div>
      </div>
    </div>
  );
}

function Container32() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-0">Software Engineer</p>
    </div>
  );
}

function Container33() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] top-0 w-[160px]">StartupXYZ • 2017 - 2020</p>
    </div>
  );
}

function Paragraph2() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Paragraph">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#374151] text-[14px] text-nowrap top-0">Built and scaled e-commerce platform from 0 to 1M users</p>
    </div>
  );
}

function Container34() {
  return (
    <div className="h-[78px] relative shrink-0 w-full" data-name="Container">
      <div aria-hidden="true" className="absolute border-[#6366f1] border-[0px_0px_0px_2px] border-solid inset-0 pointer-events-none" />
      <div className="size-full">
        <div className="content-stretch flex flex-col gap-[4px] items-start pl-[18px] pr-0 py-0 relative size-full">
          <Container32 />
          <Container33 />
          <Paragraph2 />
        </div>
      </div>
    </div>
  );
}

function Container35() {
  return (
    <div className="content-stretch flex flex-col gap-[16px] h-[172px] items-start relative shrink-0 w-full" data-name="Container">
      <Container31 />
      <Container34 />
    </div>
  );
}

function Container36() {
  return (
    <div className="content-stretch flex flex-col gap-[16px] h-[212px] items-start relative shrink-0 w-full" data-name="Container">
      <Heading2 />
      <Container35 />
    </div>
  );
}

function Heading3() {
  return (
    <div className="h-[24px] relative shrink-0 w-full" data-name="Heading 3">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-0 text-[#111827] text-[16px] text-nowrap top-[-2px]">Education</p>
    </div>
  );
}

function Container37() {
  return (
    <div className="h-[22.5px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[22.5px] left-0 text-[#111827] text-[15px] text-nowrap top-0">Master of Science in Computer Science</p>
    </div>
  );
}

function Container38() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] top-0 w-[198px]">Stanford University • 2015-2017</p>
    </div>
  );
}

function Container39() {
  return (
    <div className="content-stretch flex flex-col h-[43.5px] items-start relative shrink-0 w-full" data-name="Container">
      <Container37 />
      <Container38 />
    </div>
  );
}

function Container40() {
  return (
    <div className="h-[22.5px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[22.5px] left-0 text-[#111827] text-[15px] text-nowrap top-0">Bachelor of Science in Software Engineering</p>
    </div>
  );
}

function Container41() {
  return (
    <div className="h-[21px] relative shrink-0 w-full" data-name="Container">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[21px] left-0 text-[#6b7280] text-[14px] top-0 w-[158px]">UC Berkeley • 2011-2015</p>
    </div>
  );
}

function Container42() {
  return (
    <div className="content-stretch flex flex-col h-[43.5px] items-start relative shrink-0 w-full" data-name="Container">
      <Container40 />
      <Container41 />
    </div>
  );
}

function Container43() {
  return (
    <div className="content-stretch flex flex-col gap-[12px] h-[99px] items-start relative shrink-0 w-full" data-name="Container">
      <Container39 />
      <Container42 />
    </div>
  );
}

function Container44() {
  return (
    <div className="content-stretch flex flex-col gap-[16px] h-[139px] items-start relative shrink-0 w-full" data-name="Container">
      <Heading3 />
      <Container43 />
    </div>
  );
}

function Container45() {
  return (
    <div className="absolute content-stretch flex flex-col gap-[24px] h-[476px] items-start left-[32px] top-[84px] w-[1238px]" data-name="Container">
      <Container28 />
      <Container36 />
      <Container44 />
    </div>
  );
}

function Container46() {
  return (
    <div className="absolute bg-white border border-[#e5e7eb] border-solid h-[594px] left-[48px] overflow-clip rounded-[12px] top-[350px] w-[1304px]" data-name="Container">
      <Container26 />
      <Container45 />
    </div>
  );
}

function Container47() {
  return (
    <div className="h-[968px] relative shrink-0 w-full" data-name="Container">
      <Button1 />
      <Container24 />
      <Container46 />
    </div>
  );
}

function CandidateProfile() {
  return (
    <div className="bg-[#f9fafb] h-[968px] relative shrink-0 w-full" data-name="CandidateProfile">
      <div className="overflow-clip rounded-[inherit] size-full">
        <div className="content-stretch flex flex-col items-start px-[56.5px] py-0 relative size-full">
          <Container47 />
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <div className="absolute bg-[#edf0f8] content-stretch flex flex-col h-[1058px] items-start left-0 pl-[96px] pr-0 py-0 top-0 w-[1609px]" data-name="App">
      <Header />
      <CandidateProfile />
    </div>
  );
}

function Icon14() {
  return (
    <div className="absolute left-[16px] size-[32px] top-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p3b973d80} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.p12632700} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text12() {
  return (
    <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[42.688px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[21.5px] text-[#4834ab] text-[16px] text-center text-nowrap top-0 translate-x-[-50%]">Home</p>
    </div>
  );
}

function Button11() {
  return (
    <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[279px]" data-name="Button">
      <Icon14 />
      <Text12 />
    </div>
  );
}

function Icon15() {
  return (
    <div className="absolute left-[16px] size-[32px] top-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p1bddf080} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.p28e98400} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text13() {
  return (
    <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[57.797px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[29px] text-[#4834ab] text-[16px] text-center text-nowrap top-0 translate-x-[-50%]">Projects</p>
    </div>
  );
}

function Button12() {
  return (
    <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[359px]" data-name="Button">
      <Icon15 />
      <Text13 />
    </div>
  );
}

function Icon16() {
  return (
    <div className="absolute left-0 size-[32px] top-0" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p122cc440} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.p3f854900} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text14() {
  return (
    <div className="h-[15px] relative shrink-0 w-[5.563px]" data-name="Text">
      <div className="bg-clip-padding border-0 border-[transparent] border-solid relative size-full">
        <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[15px] left-[3px] text-[10px] text-center text-nowrap text-white top-0 translate-x-[-50%]">3</p>
      </div>
    </div>
  );
}

function Container48() {
  return (
    <div className="absolute bg-[#ef4444] content-stretch flex items-center justify-center left-[18px] rounded-[3.35544e+07px] size-[18px] top-[-4px]" data-name="Container">
      <Text14 />
    </div>
  );
}

function Container49() {
  return (
    <div className="absolute left-[16px] size-[32px] top-[16px]" data-name="Container">
      <Icon16 />
      <Container48 />
    </div>
  );
}

function Text15() {
  return (
    <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[40.906px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[20.5px] text-[#4834ab] text-[16px] text-center text-nowrap top-0 translate-x-[-50%]">Alerts</p>
    </div>
  );
}

function Button13() {
  return (
    <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[439px]" data-name="Button">
      <Container49 />
      <Text15 />
    </div>
  );
}

function Icon17() {
  return (
    <div className="absolute left-[16px] size-[32px] top-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.p27a3200} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.pdc20e80} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.p18f42980} id="Vector_3" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.p2ee517c0} id="Vector_4" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text16() {
  return (
    <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[80.953px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[40px] text-[#4834ab] text-[16px] text-center text-nowrap top-0 translate-x-[-50%]">Candidates</p>
    </div>
  );
}

function Button14() {
  return (
    <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[519px]" data-name="Button">
      <Icon17 />
      <Text16 />
    </div>
  );
}

function Icon18() {
  return (
    <div className="absolute left-[16px] size-[32px] top-[16px]" data-name="Icon">
      <svg className="block size-full" fill="none" preserveAspectRatio="none" viewBox="0 0 32 32">
        <g id="Icon">
          <path d={svgPaths.pad4aa00} id="Vector" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
          <path d={svgPaths.p34392700} id="Vector_2" stroke="var(--stroke-0, #4834AB)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.66667" />
        </g>
      </svg>
    </div>
  );
}

function Text17() {
  return (
    <div className="absolute h-[24px] left-[80px] opacity-0 top-[20px] w-[57.813px]" data-name="Text">
      <p className="absolute font-['Arimo:Regular',sans-serif] font-normal leading-[24px] left-[29px] text-[#4834ab] text-[16px] text-center text-nowrap top-0 translate-x-[-50%]">Settings</p>
    </div>
  );
}

function Button15() {
  return (
    <div className="absolute left-[16px] overflow-clip rounded-[24px] size-[64px] top-[599px]" data-name="Button">
      <Icon18 />
      <Text17 />
    </div>
  );
}

function Sidebar() {
  return (
    <div className="absolute bg-[#f7fafe] h-[942px] left-0 overflow-clip rounded-br-[24px] rounded-tr-[24px] top-0 w-[96px]" data-name="Sidebar">
      <Button11 />
      <Button12 />
      <Button13 />
      <Button14 />
      <Button15 />
    </div>
  );
}

export default function EraMatchCombinedUiPreFinal() {
  return (
    <div className="bg-white relative size-full" data-name="EraMatch Combined UI - PreFinal">
      <App />
      <Sidebar />
    </div>
  );
}